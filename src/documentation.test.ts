import {access, readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {describe, expect, it} from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const ENGLISH_DOCS = [
  "README.md",
  "docs/guides/developer-project.md",
  "docs/guides/existing-game.md",
  "docs/reference/tools.md",
  "docs/reference/evidence-and-integrity.md",
  "docs/reference/experiments.md",
] as const;

async function read(path: string): Promise<string> {
  return readFile(resolve(ROOT, path), "utf8");
}

describe("public documentation", () => {
  it("keeps the README short and puts the quick start before background detail", async () => {
    const content = await read("README.md");
    const lines = content.split(/\r?\n/u);

    expect(lines.length).toBeLessThanOrEqual(220);
    expect(lines.indexOf("## Quick start")).toBeGreaterThan(0);
    expect(lines.indexOf("## Quick start")).toBeLessThan(60);
    expect(content).toContain("## Choose a workflow");
    expect(content).toContain("## Documentation");
  });

  it("keeps the new public entry points in English", async () => {
    for (const path of ENGLISH_DOCS) {
      const content = await read(path);
      expect(content, path).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
    }
  });

  it("links every guide from the README and ships them in the npm package", async () => {
    const readme = await read("README.md");
    const packageJson = JSON.parse(await read("package.json")) as {files?: string[]};

    for (const path of ENGLISH_DOCS.slice(1)) {
      expect(readme).toContain(`(${path})`);
    }
    expect(packageJson.files).toEqual(expect.arrayContaining([
      "docs/guides",
      "docs/reference",
    ]));
  });

  it("keeps every local Markdown link resolvable", async () => {
    for (const path of ENGLISH_DOCS) {
      const content = await read(path);
      const targets = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
        .map((match) => match[1])
        .filter((target): target is string => target !== undefined)
        .filter((target) => !/^(?:https?:|mailto:|#)/u.test(target));

      for (const target of targets) {
        const localPath = decodeURIComponent(target.split("#", 1)[0] ?? "");
        expect(localPath, `${path}: ${target}`).not.toBe("");
        await expect(
          access(resolve(ROOT, dirname(path), localPath)),
          `${path}: ${target}`,
        ).resolves.toBeUndefined();
      }
    }
  });

  it("documents the same desktop platforms enforced by CI", async () => {
    const readme = await read("README.md");
    const workflow = await read(".github/workflows/ci.yml");

    expect(readme).toContain("Linux, Windows, and macOS on Apple Silicon");
    expect(workflow).toContain("os: [ubuntu-latest, windows-latest, macos-26]");
    expect(workflow).toContain("macos-storage-reliability:");
    expect(workflow).toContain("macos-26 arm64 / Node.js 24 / storage reliability");
    expect(workflow.match(/Verify Apple Silicon runner/gu)).toHaveLength(2);
  });

  it("separates universal skill installation from MCP server setup", async () => {
    const readme = await read("README.md");

    expect(readme).toContain("npx skills add ZaK3939/GamePlayerLens --list");
    expect(readme).toContain("npx skills add ZaK3939/GamePlayerLens --skill game-player-lens");
    expect(readme).toMatch(/installs[\s\S]*skill[\s\S]*does not install[\s\S]*MCP server/i);
    expect(readme).toContain("git clone https://github.com/ZaK3939/GamePlayerLens.git");
    expect(readme).toContain('"command": "node"');
    expect(readme).toContain('"args": ["/absolute/path/to/GamePlayerLens/dist/cli.js"]');
    expect(readme).not.toContain("npx game-player-lens");
  });
});
