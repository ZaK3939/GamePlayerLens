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

    expect(readme).toContain("cd /path/to/your-game");
    expect(readme).toContain("https://github.com/ZaK3939/GamePlayerLens/tree/v0.6.1/skills/game-player-lens");
    expect(readme).toContain("npx skills list");
    expect(readme).toMatch(/installs[\s\S]*skill[\s\S]*does not install[\s\S]*MCP server/i);
    expect(readme).toContain("npx --yes --package=github:ZaK3939/GamePlayerLens#v0.6.1 game-player-lens doctor");
    expect(readme).toContain('"command": "npx"');
    expect(readme).toContain('"--package=github:ZaK3939/GamePlayerLens#v0.6.1"');
    expect(readme).toMatch(/Skill check[\s\S]*\$game-player-lens[\s\S]*MCP check[\s\S]*get_status/i);
    expect(readme).toContain("Node.js 22 or newer");
    expect(readme).toMatch(/doctor[\s\S]*storage is not ready/i);
    expect(readme).toContain("game-player-lens docs list");
    expect(readme).toContain("game-player-lens docs show <name>");
    expect(readme).toContain('"buildUrl": "http://localhost:4173/play"');
    expect(readme).not.toContain('"buildUrl": "http://127.0.0.1:4173/play"');
  });

  it("documents explicit local agent feedback without automatic GitHub mutation", async () => {
    const readme = await read("README.md");
    const tools = await read("docs/reference/tools.md");
    const integrity = await read("docs/reference/evidence-and-integrity.md");

    expect(readme).toMatch(/report_agent_experience[\s\S]*create-only local artifacts/i);
    expect(readme).toMatch(/two distinct pseudonymous session IDs[\s\S]*do not prove independent[\s\S]*never creates a GitHub issue/i);
    expect(tools).toMatch(/does not silently collect tool calls[\s\S]*arguments[\s\S]*sessions/i);
    expect(integrity).toMatch(/outside game evidence[\s\S]*user approval/i);
  });
});
