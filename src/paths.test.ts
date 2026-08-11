import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPathResolver,
  initializePackagedPaths,
  initializeRepositoryPaths,
} from "./paths.js";

let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "steam-user-sim-paths-"));
  for (const relative of [
    "knowledge/personas",
    "knowledge/templates",
    "knowledge/rubrics",
    "knowledge/intel/captures",
    "knowledge/ui-references",
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

  it("normalizes display target and artifact ids for intel JSON", () => {
    const resolver = createPathResolver(root);
    const result = resolver.resolveIntelArtifactPath("Hades II", "Price Snapshot");

    expect(result).toEqual({
      targetId: "hades-ii",
      artifactId: "price-snapshot",
      absolutePath: join(
        resolver.root,
        "knowledge/intel/hades-ii/price-snapshot.json",
      ),
      relativePath: "knowledge/intel/hades-ii/price-snapshot.json",
    });
    expect(isAbsolute(result.absolutePath)).toBe(true);
  });

  it("normalizes display target and topic for evaluation Markdown", () => {
    const resolver = createPathResolver(root);
    const result = resolver.resolveEvaluationPath(
      "Hades II",
      "2026-08-11",
      "JP price test",
    );

    expect(result).toEqual({
      targetId: "hades-ii",
      topicId: "jp-price-test",
      absolutePath: join(
        resolver.root,
        "workspaces/hades-ii/2026-08-11-jp-price-test.md",
      ),
      relativePath: "workspaces/hades-ii/2026-08-11-jp-price-test.md",
    });
  });

  it("preserves Japanese letters in evaluation target and topic ids", () => {
    const resolver = createPathResolver(root);
    const result = resolver.resolveEvaluationPath(
      "ハデス II",
      "2026-08-11",
      "価格 改定",
    );

    expect(result).toEqual({
      targetId: "ハデス-ii",
      topicId: "価格-改定",
      absolutePath: join(
        resolver.root,
        "workspaces/ハデス-ii/2026-08-11-価格-改定.md",
      ),
      relativePath: "workspaces/ハデス-ii/2026-08-11-価格-改定.md",
    });
  });

  it("folds Latin diacritics while preserving Unicode canonical ids", () => {
    const resolver = createPathResolver(root);
    const result = resolver.resolveIntelArtifactPath("Hádès II", "価格 Snapshot");

    expect(result.targetId).toBe("hades-ii");
    expect(result.artifactId).toBe("価格-snapshot");
    expect(result.relativePath)
      .toBe("knowledge/intel/hades-ii/価格-snapshot.json");
  });

  it.each([
    "",
    "   ",
    ".",
    "..",
    "...",
    "../escape",
    "a/b",
    "a\\b",
    "nul\0byte",
    "/absolute",
    "a".repeat(65),
  ])("rejects unsafe artifact display names: %j", (name) => {
    const resolver = createPathResolver(root);
    expect(() => resolver.resolveIntelArtifactPath(name, "valid")).toThrow();
    expect(() => resolver.resolveIntelArtifactPath("valid", name)).toThrow();
    expect(() => resolver.resolveEvaluationPath("valid", "2026-08-11", name))
      .toThrow();
  });

  it("rejects display names longer than 80 characters before normalization", () => {
    const resolver = createPathResolver(root);
    expect(() => resolver.resolveIntelArtifactPath(`${"a".repeat(64)}                 `, "x"))
      .toThrow();
  });

  it("rejects invalid evaluation dates", () => {
    const resolver = createPathResolver(root);
    expect(() => resolver.resolveEvaluationPath("Hades II", "11-08-2026", "price"))
      .toThrow(/date/i);
  });

  it("resolves capture and UI reference ids only to basename PNG files", () => {
    const resolver = createPathResolver(root);

    expect(resolver.resolveCaptureReadPath("Hero Capture")).toEqual({
      id: "hero-capture",
      absolutePath: join(
        resolver.root,
        "knowledge/intel/captures/hero-capture.png",
      ),
      relativePath: "knowledge/intel/captures/hero-capture.png",
    });
    expect(resolver.resolveUiReferencePath("Main Menu")).toEqual({
      id: "main-menu",
      absolutePath: join(resolver.root, "knowledge/ui-references/main-menu.png"),
      relativePath: "knowledge/ui-references/main-menu.png",
    });
    expect(() => resolver.resolveCaptureReadPath("../capture.png")).toThrow();
    expect(() => resolver.resolveUiReferencePath("nested/reference.png")).toThrow();
  });

  it("rejects symlinked artifact parents and existing artifact files", () => {
    const resolver = createPathResolver(root);
    const outsideDirectory = join(root, "artifact-outside");
    mkdirSync(outsideDirectory);
    symlinkSync(outsideDirectory, join(root, "knowledge/intel/linked-target"));
    expect(() => resolver.resolveIntelArtifactPath("linked target", "snapshot"))
      .toThrow(/symlink/i);

    const capture = join(root, "knowledge/intel/captures/linked-capture.png");
    const outsidePng = join(root, "outside.png");
    writeFileSync(outsidePng, "not really a png");
    symlinkSync(outsidePng, capture);
    expect(() => resolver.resolveCaptureReadPath("linked capture"))
      .toThrow(/symlink/i);
  });

  it("does not create target directories or artifact files", () => {
    const resolver = createPathResolver(root);
    const result = resolver.resolveIntelArtifactPath("Missing Target", "Snapshot");

    expect(() => resolver.resolveIntelArtifactPath("Missing Target", "Snapshot"))
      .not.toThrow();
    expect(() => resolver.resolveCaptureReadPath("missing-capture")).not.toThrow();
    expect(result.absolutePath).toContain("missing-target");
    expect(existsSync(join(resolver.root, "knowledge/intel/missing-target")))
      .toBe(false);
    expect(existsSync(result.absolutePath)).toBe(false);
  });
});

describe("production repository startup", () => {
  it.each(["knowledge", "skills", "workspaces"])(
    "fails immediately when %s is missing",
    (missing) => {
      const repo = mkdtempSync(join(tmpdir(), "steam-user-sim-startup-"));
      writeFileSync(join(repo, "package.json"), JSON.stringify({name: "game-player-lens"}));
      for (const directory of ["knowledge", "skills", "workspaces"]) {
        if (directory !== missing) mkdirSync(join(repo, directory));
      }

      try {
        expect(() => initializeRepositoryPaths(repo)).toThrow(
          new RegExp(`required repository directory.*${missing}`, "i"),
        );
      } finally {
        rmSync(repo, {recursive: true, force: true});
      }
    },
  );
});

describe("packaged startup", () => {
  it("separates immutable package assets from mutable user data", () => {
    const base = mkdtempSync(join(tmpdir(), "game-player-lens-package-"));
    const assetRoot = join(base, "package");
    const dataRoot = join(base, "data");
    for (const relative of ["knowledge/templates", "knowledge/rubrics", "skills"]) {
      mkdirSync(join(assetRoot, relative), {recursive: true});
    }
    writeFileSync(join(assetRoot, "knowledge/templates/adoption-eval.md"), "template");
    writeFileSync(join(assetRoot, "knowledge/rubrics/harsh-critic.md"), "rubric");
    writeFileSync(join(assetRoot, "skills/run-sim.md"), "recipe");

    try {
      const resolver = initializePackagedPaths(assetRoot, dataRoot);
      const realAssetRoot = realpathSync(assetRoot);
      const realDataRoot = realpathSync(dataRoot);

      expect(resolver.assetRoot).toBe(realAssetRoot);
      expect(resolver.root).toBe(realDataRoot);
      expect(resolver.resolveKnowledgePath("templates", "adoption-eval.md"))
        .toBe(join(realAssetRoot, "knowledge/templates/adoption-eval.md"));
      expect(resolver.resolveKnowledgePath("rubrics", "harsh-critic.md"))
        .toBe(join(realAssetRoot, "knowledge/rubrics/harsh-critic.md"));
      expect(resolver.resolveSkillPath("run-sim.md"))
        .toBe(join(realAssetRoot, "skills/run-sim.md"));
      expect(resolver.resolvePersonaPath("tester"))
        .toBe(join(realDataRoot, "knowledge/personas/tester.json"));
      expect(resolver.resolveIntelArtifactPath("Hades II", "Snapshot"))
        .toMatchObject({
          absolutePath: join(realDataRoot, "knowledge/intel/hades-ii/snapshot.json"),
          relativePath: "knowledge/intel/hades-ii/snapshot.json",
        });
      expect(resolver.resolveEvaluationPath("Hades II", "2026-08-11", "Price"))
        .toMatchObject({
          absolutePath: join(realDataRoot, "workspaces/hades-ii/2026-08-11-price.md"),
          relativePath: "workspaces/hades-ii/2026-08-11-price.md",
        });
      for (const relative of [
        "knowledge/personas",
        "knowledge/intel/captures",
        "knowledge/ui-references",
        "workspaces",
      ]) {
        expect(existsSync(join(dataRoot, relative))).toBe(true);
      }
    } finally {
      rmSync(base, {recursive: true, force: true});
    }
  });

  it("rejects data-home symlinks before creating directories through them", () => {
    const base = mkdtempSync(join(tmpdir(), "game-player-lens-package-symlink-"));
    const assetRoot = join(base, "package");
    const dataRoot = join(base, "data");
    const outside = join(base, "outside");
    for (const relative of ["knowledge/templates", "knowledge/rubrics", "skills"]) {
      mkdirSync(join(assetRoot, relative), {recursive: true});
    }
    mkdirSync(dataRoot);
    mkdirSync(outside);
    symlinkSync(outside, join(dataRoot, "knowledge"));

    try {
      expect(() => initializePackagedPaths(assetRoot, dataRoot)).toThrow();
      expect(existsSync(join(outside, "personas"))).toBe(false);
      expect(existsSync(join(outside, "intel"))).toBe(false);
      expect(existsSync(join(outside, "ui-references"))).toBe(false);
    } finally {
      rmSync(base, {recursive: true, force: true});
    }
  });
});
