import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  AnyArtifactKindSchema,
  ArtifactKindSchema,
  ImageArtifactKindSchema,
  MAX_EVALUATION_BYTES,
  MAX_INTEL_PAYLOAD_BYTES,
  createArtifactStore,
  type ArtifactFileOps,
  type SaveIntelInput,
} from "./artifacts.js";
import {createPathResolver} from "./paths.js";

const roots: string[] = [];
const now = new Date("2026-08-11T09:10:11.000Z");

const REQUIRED_INDIE_SECTIONS = [
  "Indie Strategy Card",
  "Core Experience Map",
  "Concept Origin Route",
  "Reward Mechanism Trace",
  "Mechanism Transfer Map",
  "Core Legibility Gate",
  "Core Revision Ledger",
  "First-contact Asset Readiness",
  "Concept Test Trace",
  "Promise-Delivery Trace",
  "Delivered Experience Playtest Trace",
  "Playtest Cohort Summary",
  "Funnel Health",
  "Milestone Readiness",
  "Experiment Queue",
  "Survival Scenarios",
] as const;

function evaluationMarkdown(options: {indieNotApplicable?: boolean; detail?: string} = {}): string {
  const section = (heading: string) => [`## ${heading}`, `${heading} evidence.`];
  const indieBody = options.indieNotApplicable
    ? ["Applicable scope was checked.", "適用外: This artifact evaluates an existing game only."]
    : [
      "Applicable to this developer-facing evaluation.",
      ...REQUIRED_INDIE_SECTIONS.flatMap((heading) => [
        `### ${heading}`,
        `${heading} evidence.`,
      ]),
    ];

  return [
    "# Evaluation",
    ...section("Decision Card"),
    ...section("Detailed Scope"),
    "## Indie Survival Strategy",
    ...indieBody,
    ...section("Overall Assessment"),
    ...section("Who Plays and Why — Flow Analysis"),
    ...section("Flow Summary"),
    ...section("Domain Findings"),
    ...section("Data Semantics"),
    ...section("Data Coverage Matrix"),
    ...section("Evidence Index"),
    "## Final Recommendation",
    options.detail ?? "Final recommendation evidence.",
  ].join("\n\n");
}

async function tempResolver() {
  const root = await mkdtemp(join(tmpdir(), "steam-user-sim-artifacts-"));
  roots.push(root);
  await mkdir(join(root, "knowledge", "intel", "captures"), {recursive: true});
  await mkdir(join(root, "workspaces"), {recursive: true});
  return createPathResolver(root);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

function intel(overrides: Partial<SaveIntelInput> = {}): SaveIntelInput {
  return {
    target: "Hádès II",
    id: "価格 Snapshot",
    sourceTool: "steam_fetch",
    observedAt: "2026-08-10T08:09:10.000Z",
    payload: {appid: 1145360, regions: ["JP", "US"]},
    ...overrides,
  };
}

describe("artifact kinds", () => {
  it("shares image kinds without widening the persistence store kinds", () => {
    expect(ImageArtifactKindSchema.options).toEqual(["capture", "ui-reference"]);
    expect(AnyArtifactKindSchema.parse("capture")).toBe("capture");
    expect(AnyArtifactKindSchema.parse("evaluation")).toBe("evaluation");
    expect(AnyArtifactKindSchema.parse("run")).toBe("run");
    expect(() => ArtifactKindSchema.parse("capture")).toThrow();
    expect(() => ArtifactKindSchema.parse("run")).toThrow();
  });
});

describe("intel artifact store", () => {
  it("saves, lists, and reads validated JSON with canonical paths", async () => {
    const resolver = await tempResolver();
    const store = createArtifactStore(resolver, {clock: () => now});

    const saved = await store.saveIntel(intel());

    expect(saved).toEqual({
      path: "knowledge/intel/hades-ii/価格-snapshot.json",
      targetId: "hades-ii",
      id: "価格-snapshot",
      artifactId: "価格-snapshot",
      sourceTool: "steam_fetch",
      observedAt: "2026-08-10T08:09:10.000Z",
      savedAt: now.toISOString(),
      sizeBytes: expect.any(Number),
    });
    await expect(store.listTargets("intel")).resolves.toEqual(["hades-ii"]);
    await expect(store.listArtifacts("intel", "Hades II")).resolves.toEqual([saved]);
    await expect(store.readIntel("Hades II", "価格 Snapshot")).resolves.toEqual({
      schemaVersion: 1,
      targetId: "hades-ii",
      artifactId: "価格-snapshot",
      sourceTool: "steam_fetch",
      observedAt: "2026-08-10T08:09:10.000Z",
      savedAt: now.toISOString(),
      payload: {appid: 1145360, regions: ["JP", "US"]},
    });
  });

  it("uses one server-clock instant for omitted observedAt and savedAt", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    const {observedAt: _observedAt, ...manualIntel} = intel({sourceTool: "manual"});

    const saved = await store.saveIntel(manualIntel);

    expect(saved).toMatchObject({
      observedAt: now.toISOString(),
      savedAt: now.toISOString(),
    });
    await expect(store.readIntel("Hades II", "価格 Snapshot")).resolves.toMatchObject({
      observedAt: now.toISOString(),
      savedAt: now.toISOString(),
    });
  });

  it("lists intel artifact ids ascending and only returns metadata", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    await store.saveIntel(intel({id: "Zulu", payload: {secret: "payload"}}));
    await store.saveIntel(intel({id: "Alpha", payload: {secret: "payload"}}));

    const listed = await store.listArtifacts("intel", "Hades II");
    expect(listed.map((item) => item.id)).toEqual(["alpha", "zulu"]);
    expect(listed.every((item) => !("payload" in item))).toBe(true);
  });

  it("atomically rejects racing no-overwrite saves without replacing the winner", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    const outcomes = await Promise.allSettled([
      store.saveIntel(intel({payload: {winner: "first"}})),
      store.saveIntel(intel({payload: {winner: "second"}})),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const record = await store.readIntel("Hades II", "価格 Snapshot");
    expect(record.payload).toEqual(
      outcomes[0]?.status === "fulfilled" ? {winner: "first"} : {winner: "second"},
    );
  });

  it("atomically replaces an existing intel file only when overwrite is true", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    await store.saveIntel(intel({payload: {version: 1}}));

    await expect(store.saveIntel(intel({payload: {version: 2}}))).rejects.toThrow(
      /already exists/i,
    );
    expect((await store.readIntel("Hades II", "価格 Snapshot")).payload)
      .toEqual({version: 1});

    await store.saveIntel(intel({payload: {version: 2}}), true);
    expect((await store.readIntel("Hades II", "価格 Snapshot")).payload)
      .toEqual({version: 2});
  });

  it.each(["link", "rename"] as const)(
    "cleans only its own temporary file when %s fails",
    async (operation) => {
      const resolver = await tempResolver();
      const targetDirectory = join(resolver.root, "knowledge", "intel", "hades-ii");
      await mkdir(targetDirectory);
      await writeFile(join(targetDirectory, ".keep.tmp"), "keep");
      const failure = vi.fn(async () => {
        throw new Error(`${operation} failed`);
      });
      const fileOps: Partial<ArtifactFileOps> = {[operation]: failure};
      const store = createArtifactStore(resolver, {clock: () => now, fileOps});

      await expect(store.saveIntel(intel(), operation === "rename")).rejects.toThrow(
        `${operation} failed`,
      );
      expect(await readdir(targetDirectory)).toEqual([".keep.tmp"]);
    },
  );

  it("ignores unrelated hidden and temporary entries when listing", async () => {
    const resolver = await tempResolver();
    const store = createArtifactStore(resolver, {clock: () => now});
    await store.saveIntel(intel());
    const targetDirectory = join(resolver.root, "knowledge", "intel", "hades-ii");
    await writeFile(join(targetDirectory, ".hidden.json"), "{}");
    await writeFile(join(targetDirectory, ".snapshot.random.tmp"), "partial");
    await writeFile(join(targetDirectory, "notes.txt"), "unrelated");
    await mkdir(join(resolver.root, "knowledge", "intel", ".hidden-target"));

    await expect(store.listTargets("intel")).resolves.toEqual(["hades-ii"]);
    expect((await store.listArtifacts("intel", "Hades II")).map((item) => item.id))
      .toEqual(["価格-snapshot"]);
  });

  it("reports malformed stored JSON as an intel schema error", async () => {
    const resolver = await tempResolver();
    const store = createArtifactStore(resolver, {clock: () => now});
    const path = resolver.resolveIntelArtifactPath("Broken", "Snapshot");
    await mkdir(join(resolver.root, "knowledge", "intel", path.targetId));
    await writeFile(path.absolutePath, JSON.stringify({schemaVersion: 1, payload: {}}));

    await expect(store.readIntel("Broken", "Snapshot")).rejects.toThrow(/intel schema/i);
    await expect(store.listArtifacts("intel", "Broken")).rejects.toThrow(/intel schema/i);
  });

  it("does not expose the data root when an artifact is missing", async () => {
    const resolver = await tempResolver();
    const store = createArtifactStore(resolver, {clock: () => now});

    let message = "";
    try {
      await store.readIntel("Missing Game", "Missing Snapshot");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/does not exist/i);
    expect(message).not.toContain(resolver.root);
  });

  it("rejects oversized or non-JSON-safe payloads before writing", async () => {
    const resolver = await tempResolver();
    const write = vi.fn(async () => undefined);
    const store = createArtifactStore(resolver, {
      clock: () => now,
      fileOps: {writeFile: write},
    });
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const arrayWithUndefinedProperty = ["safe"] as unknown[] & {extra?: unknown};
    arrayWithUndefinedProperty.extra = undefined;

    await expect(store.saveIntel(intel({payload: "x".repeat(MAX_INTEL_PAYLOAD_BYTES)})))
      .rejects.toThrow(/1 MiB/i);
    for (const payload of [
      undefined,
      1n,
      () => undefined,
      Number.POSITIVE_INFINITY,
      cycle,
      arrayWithUndefinedProperty,
    ]) {
      await expect(store.saveIntel({...intel(), payload})).rejects.toThrow(/JSON-safe/i);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("allows a payload whose serialized UTF-8 size is exactly 1 MiB", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    const payload = "x".repeat(MAX_INTEL_PAYLOAD_BYTES - 2);

    await expect(store.saveIntel(intel({payload}))).resolves.toMatchObject({
      id: "価格-snapshot",
    });
  });

  it("rejects invalid observedAt and every source tool outside the exact enum", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});

    await expect(store.saveIntel(intel({observedAt: "2026-02-30T00:00:00Z"})))
      .rejects.toThrow();
    await expect(store.saveIntel({...intel(), sourceTool: "steam_store"}))
      .rejects.toThrow();
  });
});

describe("evaluation artifact store", () => {
  it("preserves Markdown bytes through save, list, and read", async () => {
    const resolver = await tempResolver();
    const store = createArtifactStore(resolver, {clock: () => now});
    const content = evaluationMarkdown({detail: "末尾に改行を足さない"}).replaceAll("\n", "\r\n");

    const saved = await store.saveEvaluation({
      target: "Hádès II",
      topic: "JP Price Test",
      content,
    });

    expect(saved).toEqual({
      path: "workspaces/hades-ii/2026-08-11-jp-price-test.md",
      targetId: "hades-ii",
      id: "2026-08-11-jp-price-test",
      date: "2026-08-11",
      topicId: "jp-price-test",
      savedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      sizeBytes: Buffer.byteLength(content, "utf8"),
    });
    await expect(readFile(join(resolver.root, saved.path), "utf8")).resolves.toBe(content);
    await expect(store.listTargets("evaluation")).resolves.toEqual(["hades-ii"]);
    await expect(store.listArtifacts("evaluation", "Hades II")).resolves.toEqual([saved]);
    await expect(store.readEvaluation("Hades II", saved.id)).resolves.toEqual({
      metadata: saved,
      content,
    });
  });

  it("lists evaluations by descending date with deterministic id ties", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    await store.saveEvaluation({
      target: "Hades II", topic: "Beta", date: "2026-08-10", content: evaluationMarkdown(),
    });
    await store.saveEvaluation({
      target: "Hades II", topic: "Alpha", date: "2026-08-11", content: evaluationMarkdown(),
    });
    await store.saveEvaluation({
      target: "Hades II", topic: "Zulu", date: "2026-08-11", content: evaluationMarkdown(),
    });

    expect((await store.listArtifacts("evaluation", "Hades II")).map((item) => item.id))
      .toEqual([
        "2026-08-11-alpha",
        "2026-08-11-zulu",
        "2026-08-10-beta",
      ]);
  });

  it("rejects invalid calendar dates, empty content, and oversized UTF-8 before writing", async () => {
    const resolver = await tempResolver();
    const write = vi.fn(async () => undefined);
    const store = createArtifactStore(resolver, {
      clock: () => now,
      fileOps: {writeFile: write},
    });

    await expect(store.saveEvaluation({
      target: "Hades II", topic: "Test", date: "2026-02-30", content: "x",
    })).rejects.toThrow(/date/i);
    await expect(store.saveEvaluation({
      target: "Hades II", topic: "Test", content: "",
    })).rejects.toThrow();
    await expect(store.saveEvaluation({
      target: "Hades II",
      topic: "Test",
      content: `${"é".repeat(MAX_EVALUATION_BYTES / 2)}x`,
    })).rejects.toThrow(/512 KiB/i);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects incomplete, empty, or unfilled canonical evaluation sections", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    const missingEvidenceIndex = evaluationMarkdown().replace(
      /\n\n## Evidence Index\n\nEvidence Index evidence\./,
      "",
    );
    const emptyDataSemantics = evaluationMarkdown().replace(
      "## Data Semantics\n\nData Semantics evidence.",
      "## Data Semantics",
    );

    await expect(store.saveEvaluation({
      target: "Hades II", topic: "Missing", content: missingEvidenceIndex,
    })).rejects.toThrow(/Evidence Index/);
    await expect(store.saveEvaluation({
      target: "Hades II", topic: "Empty", content: emptyDataSemantics,
    })).rejects.toThrow(/Data Semantics/);
    await expect(store.saveEvaluation({
      target: "Hades II", topic: "Placeholder", content: `${evaluationMarkdown()}\n\n［TODO］`,
    })).rejects.toThrow(/placeholder/i);
  });

  it("accepts detailed and explicitly not-applicable indie strategy structures", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});

    await expect(store.saveEvaluation({
      target: "Hades II", topic: "Detailed", content: evaluationMarkdown(),
    })).resolves.toMatchObject({topicId: "detailed"});
    await expect(store.saveEvaluation({
      target: "Hades II",
      topic: "Existing Game",
      content: evaluationMarkdown({indieNotApplicable: true}),
    })).resolves.toMatchObject({topicId: "existing-game"});
  });

  it("requires every detailed indie strategy subsection", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    const missingRewardTrace = evaluationMarkdown().replace(
      /\n\n### Reward Mechanism Trace\n\nReward Mechanism Trace evidence\./,
      "",
    ).replace(
      "Applicable to this developer-facing evaluation.",
      "Applicable to this developer-facing evaluation.\n\n適用外: Mechanism transfer only.",
    );

    await expect(store.saveEvaluation({
      target: "Hades II", topic: "Missing Reward", content: missingRewardTrace,
    })).rejects.toThrow(/Reward Mechanism Trace/);
  });

  it("allows Markdown whose exact UTF-8 size is 512 KiB", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    const base = evaluationMarkdown({detail: ""});
    const content = `${base}${"x".repeat(MAX_EVALUATION_BYTES - Buffer.byteLength(base, "utf8"))}`;

    await expect(store.saveEvaluation({target: "Hades II", topic: "Limit", content}))
      .resolves.toMatchObject({sizeBytes: MAX_EVALUATION_BYTES});
  });

  it("supports atomic evaluation replacement and default no-overwrite", async () => {
    const store = createArtifactStore(await tempResolver(), {clock: () => now});
    const input = {
      target: "Hades II",
      topic: "Test",
      date: "2026-08-11",
      content: evaluationMarkdown({detail: "one"}),
    };
    await store.saveEvaluation(input);

    await expect(store.saveEvaluation({
      ...input, content: evaluationMarkdown({detail: "two"}),
    })).rejects.toThrow(
      /already exists/i,
    );
    expect((await store.readEvaluation("Hades II", "2026-08-11-test")).content)
      .toBe(evaluationMarkdown({detail: "one"}));

    await store.saveEvaluation({...input, content: evaluationMarkdown({detail: "two"})}, true);
    expect((await store.readEvaluation("Hades II", "2026-08-11-test")).content)
      .toBe(evaluationMarkdown({detail: "two"}));
  });
});

describe("artifact path safety", () => {
  it("revalidates containment and symlinks after creating a target directory", async () => {
    const resolver = await tempResolver();
    const outside = await mkdtemp(join(tmpdir(), "steam-user-sim-artifacts-outside-"));
    roots.push(outside);
    const realMkdir: ArtifactFileOps["mkdir"] = (path, options) => mkdir(path, options);
    const store = createArtifactStore(resolver, {
      clock: () => now,
      fileOps: {
        mkdir: async (path, options) => {
          await realMkdir(path, options);
          await rename(path, `${path}-removed`);
          await symlink(outside, path);
        },
      },
    });

    await expect(store.saveIntel(intel({target: "Swapped Target"})))
      .rejects.toThrow(/symlink|root/i);
    expect(await readdir(outside)).toEqual([]);
  });

  it("rejects symlinked files during read and list", async () => {
    const resolver = await tempResolver();
    const store = createArtifactStore(resolver, {clock: () => now});
    const destination = resolver.resolveIntelArtifactPath("Linked", "Snapshot");
    await mkdir(join(resolver.root, "knowledge", "intel", destination.targetId));
    const outside = join(resolver.root, "outside.json");
    await writeFile(outside, JSON.stringify({}));
    await symlink(outside, destination.absolutePath);

    await expect(store.readIntel("Linked", "Snapshot")).rejects.toThrow(/symlink/i);
    await expect(store.listArtifacts("intel", "Linked")).rejects.toThrow(/symlink/i);
  });

  it("rejects visible symlinked target directories during target listing", async () => {
    const resolver = await tempResolver();
    const store = createArtifactStore(resolver, {clock: () => now});
    const outside = await mkdtemp(join(tmpdir(), "steam-user-sim-target-outside-"));
    roots.push(outside);
    await symlink(outside, join(resolver.root, "knowledge", "intel", "linked-target"));

    await expect(store.listTargets("intel")).rejects.toThrow(/symlink/i);
  });

  it("creates only canonical direct target directories", async () => {
    const resolver = await tempResolver();
    const store = createArtifactStore(resolver, {clock: () => now});
    await store.saveIntel(intel({target: "New Target"}));
    await store.saveEvaluation({
      target: "別 Target", topic: "Topic", content: evaluationMarkdown(),
    });

    expect((await lstat(join(resolver.root, "knowledge", "intel", "new-target"))).isDirectory())
      .toBe(true);
    expect((await lstat(join(resolver.root, "workspaces", "別-target"))).isDirectory())
      .toBe(true);
  });
});
