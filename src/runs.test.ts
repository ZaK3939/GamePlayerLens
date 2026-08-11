import {createHash} from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {createArtifactStore} from "./artifacts.js";
import {createPersonaStore, type Persona} from "./personas.js";
import {createPathResolver} from "./paths.js";
import {
  MAX_RUN_BYTES,
  SaveRunInputSchema,
  createRunStore,
  type SaveRunInput,
} from "./runs.js";

const roots: string[] = [];
const NOW = new Date("2026-08-11T12:34:56.000Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function persona(id = "jp-skeptic"): Persona {
  return {
    id,
    source_appids: [1145350],
    archetype: "Japanese localization skeptic",
    playtime_profile: "100h action roguelike player",
    priorities: ["readable combat"],
    voice: [1, 2, 3].map((index) => ({
      text: `voice ${index}`,
      source_appid: 1145350,
      recommendation_id: `rec-${index}`,
      language: "japanese",
      voted_up: index !== 3,
    })),
    dealbreakers: ["unreadable text"],
    price_sensitivity: "medium",
  };
}

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "game-player-lens-runs-"));
  roots.push(root);
  await Promise.all([
    "knowledge/personas",
    "knowledge/templates",
    "knowledge/rubrics",
    "knowledge/intel/captures",
    "knowledge/ui-references",
    "skills",
    "workspaces",
  ].map((directory) => mkdir(join(root, directory), {recursive: true})));
  const recipe = "# run-sim\n\nEvidence-grounded simulation recipe.\n";
  await writeFile(join(root, "skills", "run-sim.md"), recipe);
  const resolver = createPathResolver(root);
  const artifacts = createArtifactStore(resolver, {clock: () => NOW});
  await artifacts.saveIntel({
    target: "Hades II",
    id: "Profile",
    sourceTool: "steam_fetch",
    observedAt: "2026-08-11T10:00:00.000Z",
    payload: {appid: 1145350},
  });
  await artifacts.saveEvaluation({
    target: "Hades II",
    topic: "Store Page",
    date: "2026-08-11",
    content: "# Evaluation\n\nCurrent versus proposal.",
  });
  await createPersonaStore(resolver).savePersona(persona());
  await writeFile(
    resolver.resolveCaptureReadPath("Store Hero").absolutePath,
    PNG_BYTES,
  );
  const store = createRunStore(resolver, {
    clock: () => NOW,
    idFactory: () => RUN_ID,
  });
  return {artifacts, recipe, resolver, root, store};
}

function runInput(overrides: Partial<SaveRunInput> = {}): SaveRunInput {
  return {
    target: "Hades II",
    topic: "Store page proposition",
    mode: "change",
    selectedDomains: ["storefront", "ui"],
    model: {provider: "Anthropic", name: "Claude", version: "test"},
    scenarios: [
      {id: "current", label: "Current", specification: "Current Steam page"},
      {id: "proposal", label: "Proposal", specification: "New capsule and copy"},
    ],
    personaIds: ["jp-skeptic"],
    evidence: [
      {ref: "profile", kind: "intel", target: "Hades II", id: "Profile"},
      {
        ref: "evaluation",
        kind: "evaluation",
        target: "Hades II",
        id: "2026-08-11-store-page",
      },
      {ref: "hero", kind: "capture", id: "Store Hero"},
    ],
    rounds: [
      {
        sequence: 1,
        phase: "persona",
        actor: "jp-skeptic",
        personaId: "jp-skeptic",
        scenarioId: "current",
        output: "The current promise is readable but generic.",
        evidenceRefs: ["profile"],
      },
      {
        sequence: 2,
        phase: "persona",
        actor: "jp-skeptic",
        personaId: "jp-skeptic",
        scenarioId: "proposal",
        output: "The proposal is clearer but still needs validation.",
        evidenceRefs: ["profile"],
      },
      {
        sequence: 3,
        phase: "domain",
        actor: "storefront-reviewer",
        domain: "storefront",
        scenarioId: "current",
        output: "The current value proposition is generic.",
        evidenceRefs: ["profile"],
      },
      {
        sequence: 4,
        phase: "domain",
        actor: "storefront-reviewer",
        domain: "storefront",
        scenarioId: "proposal",
        output: "The proposal differentiates its combat promise.",
        evidenceRefs: ["profile"],
      },
      {
        sequence: 5,
        phase: "domain",
        actor: "ui-reviewer",
        domain: "ui",
        scenarioId: "current",
        output: "The current capsule hierarchy is serviceable.",
        evidenceRefs: ["hero"],
      },
      {
        sequence: 6,
        phase: "domain",
        actor: "ui-reviewer",
        domain: "ui",
        scenarioId: "proposal",
        output: "The capsule hierarchy is stronger.",
        evidenceRefs: ["hero"],
      },
      {
        sequence: 7,
        phase: "critic",
        actor: "harsh-critic",
        scenarioId: "proposal",
        output: "Confidence remains limited without a real playtest.",
        evidenceRefs: ["profile", "hero"],
      },
      {
        sequence: 8,
        phase: "synthesis",
        actor: "lead-synthesizer",
        output: "Test the proposal before making a conversion claim.",
        evidenceRefs: ["profile", "hero"],
      },
    ],
    warnings: ["No observed post-change telemetry"],
    confidence: {
      level: "medium",
      basis: "Store data and screenshot evidence only",
      calibrationStatus: "not-calibrated",
    },
    finalEvaluationRef: "evaluation",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("run input schema", () => {
  it("requires replayable scenario, domain, persona, evidence, and round references", () => {
    expect(SaveRunInputSchema.parse(runInput())).toMatchObject({mode: "change"});

    for (const invalid of [
      runInput({scenarios: [runInput().scenarios[0]!]}),
      runInput({selectedDomains: ["ui", "ui"]}),
      runInput({personaIds: ["jp-skeptic", "jp-skeptic"]}),
      runInput({evidence: [runInput().evidence[0]!, runInput().evidence[0]!]}),
      runInput({rounds: runInput().rounds.filter((round) => round.domain !== "ui")}),
      runInput({rounds: runInput().rounds.filter((round) => !(
        round.phase === "persona" && round.scenarioId === "proposal"
      ))}),
      runInput({rounds: runInput().rounds.filter((round) => !(
        round.phase === "domain" && round.domain === "ui" && round.scenarioId === "current"
      ))}),
      runInput({rounds: runInput().rounds.filter((round) => round.phase !== "critic")}),
      runInput({rounds: runInput().rounds.filter((round) => round.phase !== "synthesis")}),
      runInput({rounds: runInput().rounds.map((round, index) => ({
        ...round,
        sequence: index + 2,
      }))}),
      runInput({rounds: [{
        ...runInput().rounds[0]!,
        evidenceRefs: ["missing"],
      }, ...runInput().rounds.slice(1)]}),
      runInput({rounds: runInput().rounds.map((round) => ({
        ...round,
        evidenceRefs: round.evidenceRefs.map((ref) => ref === "hero" ? "profile" : ref),
      }))}),
      runInput({rounds: runInput().rounds.map((round, index) => index === 0
        ? {...round, evidenceRefs: ["evaluation"]}
        : round)}),
      runInput({finalEvaluationRef: "profile"}),
    ]) {
      expect(() => SaveRunInputSchema.parse(invalid)).toThrow();
    }
  });

  it("rejects structurally valid but incomplete scenario and persona matrices", () => {
    const withoutUiCurrent = runInput().rounds
      .filter((round) => !(
        round.phase === "domain" && round.domain === "ui" && round.scenarioId === "current"
      ))
      .map((round, index) => ({...round, sequence: index + 1}));
    const domainResult = SaveRunInputSchema.safeParse(runInput({rounds: withoutUiCurrent}));
    expect(domainResult.success).toBe(false);
    if (domainResult.success) throw new Error("expected missing scenario/domain cell");
    expect(domainResult.error.issues.map((issue) => issue.message)).toContain(
      "scenario/domain cell has no recorded round: current/ui",
    );

    const withoutProposalPersona = runInput().rounds
      .filter((round) => !(
        round.phase === "persona" && round.scenarioId === "proposal"
      ))
      .map((round, index) => ({...round, sequence: index + 1}));
    const personaResult = SaveRunInputSchema.safeParse(runInput({rounds: withoutProposalPersona}));
    expect(personaResult.success).toBe(false);
    if (personaResult.success) throw new Error("expected missing persona/scenario cell");
    expect(personaResult.error.issues.map((issue) => issue.message)).toContain(
      "persona/scenario cell has no recorded round: jp-skeptic/proposal",
    );
  });

  it("accepts one scenario for baseline and rejects extra scenario claims", () => {
    const baseline = runInput({
      mode: "baseline",
      scenarios: [{id: "current", label: "Current", specification: "Current state"}],
      rounds: runInput().rounds.map((round) => ({...round, scenarioId: "current"})),
    });
    expect(() => SaveRunInputSchema.parse(baseline)).not.toThrow();
    expect(() => SaveRunInputSchema.parse({
      ...baseline,
      scenarios: runInput().scenarios,
    })).toThrow();
  });
});

describe("run store", () => {
  it("saves an immutable, hashed run and round-trips list/read metadata", async () => {
    const {recipe, resolver, store} = await harness();

    const saved = await store.saveRun(runInput());
    const read = await store.readRun("Hades II", RUN_ID);

    expect(saved).toMatchObject({
      path: `workspaces/hades-ii/runs/${RUN_ID}.json`,
      targetId: "hades-ii",
      id: RUN_ID,
      runId: RUN_ID,
      topic: "Store page proposition",
      mode: "change",
      selectedDomains: ["storefront", "ui"],
      savedAt: NOW.toISOString(),
      roundCount: 8,
      evidenceCount: 3,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(read.metadata).toEqual(saved);
    expect(read.record).toMatchObject({
      schemaVersion: 1,
      runId: RUN_ID,
      targetId: "hades-ii",
      recipe: {
        id: "run-sim.md",
        path: "skills/run-sim.md",
        sha256: sha256(recipe),
      },
      model: {
        provider: "Anthropic",
        name: "Claude",
        version: "test",
        reportedByClient: true,
      },
      personas: [{
        id: "jp-skeptic",
        path: "knowledge/personas/jp-skeptic.json",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }],
      evidence: [
        expect.objectContaining({
          ref: "profile",
          kind: "intel",
          path: "knowledge/intel/hades-ii/profile.json",
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          ref: "evaluation",
          kind: "evaluation",
          path: "workspaces/hades-ii/2026-08-11-store-page.md",
        }),
        expect.objectContaining({
          ref: "hero",
          kind: "capture",
          path: "knowledge/intel/captures/store-hero.png",
          sha256: sha256(PNG_BYTES),
        }),
      ],
      coverage: {
        scenarioDomain: {covered: 4, total: 4, ratio: 1, missing: []},
        personaScenario: {covered: 2, total: 2, ratio: 1, missing: []},
        analysisEvidence: {referenced: 2, total: 2, ratio: 1, unusedRefs: []},
        domains: [
          expect.objectContaining({
            domain: "storefront",
            scenarioIds: ["current", "proposal"],
            evidenceRefs: ["profile"],
            sourceTools: ["steam_fetch"],
          }),
          expect.objectContaining({
            domain: "ui",
            scenarioIds: ["current", "proposal"],
            evidenceRefs: ["hero"],
            evidenceKinds: ["capture"],
          }),
        ],
      },
      seal: {
        algorithm: "sha256",
        canonicalSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      confidence: {
        level: "medium",
        basis: "Store data and screenshot evidence only",
        calibrationStatus: "not-calibrated",
        reportedByClient: true,
      },
    });
    expect(read.integrity).toMatchObject({
      status: "verified",
      record: {status: "verified"},
      issueCount: 0,
      dependencies: expect.arrayContaining([
        expect.objectContaining({type: "recipe", status: "verified"}),
        expect.objectContaining({type: "persona", ref: "jp-skeptic", status: "verified"}),
        expect.objectContaining({type: "evidence", ref: "profile", status: "verified"}),
      ]),
    });
    expect(saved.sha256).toBe(sha256(await readFile(
      resolver.resolveRunPath("Hades II", RUN_ID).absolutePath,
    )));
    await expect(store.listTargets()).resolves.toEqual(["hades-ii"]);
    await expect(store.listRuns("Hades II")).resolves.toEqual([saved]);
  });

  it("preserves Unicode canonical target ids in saved and listed runs", async () => {
    const {store} = await harness();
    const saved = await store.saveRun(runInput({target: "ハデス II"}));

    expect(saved).toMatchObject({
      targetId: "ハデス-ii",
      path: `workspaces/ハデス-ii/runs/${RUN_ID}.json`,
    });
    await expect(store.listTargets()).resolves.toEqual(["ハデス-ii"]);
    await expect(store.readRun("ハデス II", RUN_ID)).resolves.toMatchObject({
      record: {targetId: "ハデス-ii"},
    });
  });

  it("rejects missing and symlinked evidence instead of recording unverifiable paths", async () => {
    const {resolver, root, store} = await harness();
    await expect(store.saveRun(runInput({
      evidence: [
        {ref: "missing", kind: "capture", id: "Missing"},
        {
          ref: "evaluation",
          kind: "evaluation",
          target: "Hades II",
          id: "2026-08-11-store-page",
        },
      ],
      rounds: runInput().rounds.map((round) => ({
        ...round,
        evidenceRefs: ["missing"],
      })),
    }))).rejects.toThrow();

    const outside = join(root, "outside.png");
    await writeFile(outside, PNG_BYTES);
    await symlink(
      outside,
      resolver.resolveCaptureReadPath("Linked").absolutePath,
    );
    await expect(store.saveRun(runInput({
      evidence: [
        {ref: "linked", kind: "capture", id: "Linked"},
        {
          ref: "evaluation",
          kind: "evaluation",
          target: "Hades II",
          id: "2026-08-11-store-page",
        },
      ],
      rounds: runInput().rounds.map((round) => ({
        ...round,
        evidenceRefs: ["linked"],
      })),
    }))).rejects.toThrow(/symlink/i);
  });

  it("keeps run ids immutable and preserves the original on collision", async () => {
    const {store} = await harness();
    await store.saveRun(runInput());

    await expect(store.saveRun(runInput({topic: "Replacement"})))
      .rejects.toThrow(/already exists/i);
    await expect(store.readRun("Hades II", RUN_ID)).resolves.toMatchObject({
      record: {topic: "Store page proposition"},
    });
  });

  it("rejects oversized serialized runs before creating a file", async () => {
    const {resolver, store} = await harness();
    const baseRounds = runInput().rounds;
    const seed = baseRounds[0]!;
    const rounds = Array.from({length: 30}, (_, index) => ({
      ...(baseRounds[index] ?? seed),
      sequence: index + 1,
      output: "x".repeat(80_000),
    }));

    await expect(store.saveRun(runInput({rounds}))).rejects.toThrow(/2 MiB/i);
    await expect(readFile(
      resolver.resolveRunPath("Hades II", RUN_ID).absolutePath,
    )).rejects.toThrow();
    expect(MAX_RUN_BYTES).toBe(2 * 1024 * 1024);
  });

  it("rejects a tampered stored record on read", async () => {
    const {resolver, store} = await harness();
    await store.saveRun(runInput());
    const path = resolver.resolveRunPath("Hades II", RUN_ID).absolutePath;
    const record = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    record.targetId = "other-game";
    await writeFile(path, JSON.stringify(record));

    await expect(store.readRun("Hades II", RUN_ID)).rejects.toThrow(/run schema/i);
  });

  it("reports valid-schema run edits and dependency drift on read", async () => {
    const {artifacts, resolver, store} = await harness();
    await store.saveRun(runInput());

    await artifacts.saveIntel({
      target: "Hades II",
      id: "Profile",
      sourceTool: "steam_fetch",
      observedAt: "2026-08-11T11:00:00.000Z",
      payload: {appid: 1145350, changed: true},
    }, {overwrite: true});

    const path = resolver.resolveRunPath("Hades II", RUN_ID).absolutePath;
    const record = JSON.parse(await readFile(path, "utf8")) as {
      rounds: Array<{output: string}>;
    };
    record.rounds[0]!.output = "Edited after the run was sealed.";
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);

    const read = await store.readRun("Hades II", RUN_ID);
    expect(read.integrity).toMatchObject({
      status: "failed",
      record: {status: "mismatch"},
      dependencies: expect.arrayContaining([
        expect.objectContaining({
          type: "evidence",
          ref: "profile",
          status: "mismatch",
        }),
      ]),
    });
    expect(read.integrity.issueCount).toBeGreaterThanOrEqual(2);
  });

  it("reports missing dependencies and preserves legacy unsealed run readability", async () => {
    const {resolver, store} = await harness();
    await store.saveRun(runInput());
    await rm(resolver.resolveCaptureReadPath("Store Hero").absolutePath);

    const missing = await store.readRun("Hades II", RUN_ID);
    expect(missing.integrity).toMatchObject({
      status: "failed",
      dependencies: expect.arrayContaining([
        expect.objectContaining({type: "evidence", ref: "hero", status: "missing"}),
      ]),
    });

    const path = resolver.resolveRunPath("Hades II", RUN_ID).absolutePath;
    const record = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    delete record.seal;
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
    await writeFile(resolver.resolveCaptureReadPath("Store Hero").absolutePath, PNG_BYTES);

    const legacy = await store.readRun("Hades II", RUN_ID);
    expect(legacy.integrity).toMatchObject({
      status: "legacy-unsealed",
      record: {status: "unsealed"},
      issueCount: 1,
    });
  });

  it("rejects symlinked workspace targets while listing", async () => {
    const {root, store} = await harness();
    const outside = join(root, "outside-target");
    await mkdir(outside);
    await symlink(outside, join(root, "workspaces", "linked-target"));

    await expect(store.listTargets()).rejects.toThrow(/symlink run targets/i);
  });
});
