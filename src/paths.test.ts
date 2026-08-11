import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPathResolver } from "./paths.js";

let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "steam-user-sim-paths-"));
  for (const relative of [
    "knowledge/personas",
    "knowledge/templates",
    "knowledge/rubrics",
    "knowledge/intel/captures",
    "skills",
    "workspaces",
  ]) {
    mkdirSync(join(root, relative), {recursive: true});
  }
});

afterAll(() => {
  rmSync(root, {recursive: true, force: true});
});

describe("safe paths", () => {
  it("resolves valid knowledge and persona ids", () => {
    const resolver = createPathResolver(root);
    expect(resolver.resolveKnowledgePath("rubrics", "harsh-critic.md"))
      .toMatch(/knowledge[/\\]rubrics[/\\]harsh-critic\.md$/);
    expect(resolver.resolvePersonaPath("jp-localization-hawk"))
      .toMatch(/knowledge[/\\]personas[/\\]jp-localization-hawk\.json$/);
  });

  it.each(["..", "../x", "../../etc/passwd", "a/b", ".hidden"])(
    "rejects traversal-like knowledge id: %s",
    (id) => {
      const resolver = createPathResolver(root);
      expect(() => resolver.resolveKnowledgePath("rubrics", id)).toThrow();
    },
  );

  it("restricts persona ids", () => {
    const resolver = createPathResolver(root);
    expect(() => resolver.resolvePersonaPath("../escape")).toThrow();
    expect(() => resolver.resolvePersonaPath(".hidden")).toThrow();
    expect(() => resolver.resolvePersonaPath("a".repeat(65))).toThrow();
  });

  it("keeps generated capture paths inside the capture directory", () => {
    const resolver = createPathResolver(root);
    const path = resolver.resolveCapturePath("../../unsafe name");
    expect(path).toMatch(/knowledge[/\\]intel[/\\]captures[/\\][a-z0-9-]+\.png$/);
  });

  it("resolves only basename markdown skill files", () => {
    const resolver = createPathResolver(root);
    expect(resolver.resolveSkillPath("run-sim.md"))
      .toMatch(/skills[/\\]run-sim\.md$/);
    expect(() => resolver.resolveSkillPath("../run-sim.md")).toThrow();
    expect(() => resolver.resolveSkillPath("run-sim.txt")).toThrow();
  });

  it("rejects existing symlinks that escape the knowledge root", () => {
    const outside = join(root, "outside.md");
    const link = join(root, "knowledge/rubrics/escape.md");
    writeFileSync(outside, "outside");
    symlinkSync(outside, link);

    const resolver = createPathResolver(root);
    expect(() => resolver.resolveKnowledgePath("rubrics", "escape.md"))
      .toThrow(/symlink|root/i);
  });

  it("rejects an allowed directory that is itself an escaping symlink", () => {
    const linkedRoot = join(root, "linked-root");
    const outside = join(root, "linked-outside");
    mkdirSync(join(linkedRoot, "knowledge"), {recursive: true});
    mkdirSync(outside, {recursive: true});
    symlinkSync(outside, join(linkedRoot, "knowledge/rubrics"));

    const resolver = createPathResolver(linkedRoot);
    expect(() => resolver.resolveKnowledgePath("rubrics", "x.md"))
      .toThrow(/directory|root/i);
  });
});
