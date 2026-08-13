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
const CALIBRATED_RUN_ID = "22222222-2222-4222-8222-222222222222";
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

function experimentSpec(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    artifactType: "experiment-spec",
    experimentId: "store-promise-001",
    targetId: "hades-ii",
    hypothesis: "A clearer promise increases qualified wishlist intent",
    mode: "change",
    plannedScenarios: runInput().scenarios,
    primaryMetricId: "qualified-wishlist-intent",
    metrics: [{
      metricId: "qualified-wishlist-intent",
      role: "primary",
      source: "human-playtest",
      instrument: "moderated store-page interview v1",
      unit: "ordinal-response",
      aggregation: "median",
      direction: "increase",
      cohort: "Japanese action roguelike players",
      window: "first 30 seconds",
      samplePlan: {unit: "participant", targetCount: 8, minimumCount: 6},
    }],
    successCriteria: [{
      criterionId: "intent-improves",
      metricId: "qualified-wishlist-intent",
      scenarioId: "proposal",
      referenceScenarioId: "current",
      comparator: ">=",
      value: 1,
    }],
    guardrails: [],
    predictions: [{
      metricId: "qualified-wishlist-intent",
      scenarioId: "proposal",
      referenceScenarioId: "current",
      predictedDelta: 1,
      confidence: "medium",
      basis: "Review-grounded persona comparison",
    }],
    stoppingRule: {
      outcomeDeadline: "2026-09-12",
      maximumSessions: 16,
      onGuardrailBreach: "stop-and-review",
      onRepeatedSourceBias: "stop-and-change-source",
    },
    orderBiasPlan: "Counterbalance current and proposal order",
    parentOutcomeRef: null,
    ...overrides,
  };
}

async function calibrationHarness(
  variant: "verified" | "broken-hash" | "missing",
) {
  const context = await harness();
  const {artifacts, resolver, store} = context;
  await artifacts.saveIntel({
    target: "Hades II",
    id: "Historical Experiment Spec",
    sourceTool: "manual",
    observedAt: "2026-08-11T10:30:00.000Z",
    payload: experimentSpec(),
  });
  const predictionInput = runInput({
    evidence: [
      {
        ref: "historical-spec",
        kind: "intel",
        target: "Hades II",
        id: "Historical Experiment Spec",
      },
      ...runInput().evidence,
    ],
    rounds: runInput().rounds.map((round) => ({
      ...round,
      evidenceRefs: [...round.evidenceRefs, "historical-spec"],
    })),
  });
  const predictionMetadata = await store.saveRun(predictionInput);
  const predictionRead = await store.readRun("Hades II", RUN_ID);
  const historicalSpecEvidence = predictionRead.record.evidence.find(
    ({ref}) => ref === "historical-spec",
  )!;

  let measurementSha: string | undefined;
  if (variant !== "missing") {
    await artifacts.saveIntel({
      target: "Hades II",
      id: "Historical Human Sessions",
      sourceTool: "manual",
      observedAt: "2026-08-11T13:00:00.000Z",
      payload: {
        schemaVersion: 1,
        artifactType: "experiment-measurement",
        measurementId: "store-promise-001-primary",
        experimentId: "store-promise-001",
        targetId: "hades-ii",
        metricId: "qualified-wishlist-intent",
        source: "human-playtest",
        instrument: "moderated store-page interview v1",
        unit: "ordinal-response",
        aggregation: "median",
        cohort: "Japanese action roguelike players",
        window: "first 30 seconds",
        scenarioResults: [
          {scenarioId: "current", value: 2, sampleSize: 8},
          {scenarioId: "proposal", value: 4, sampleSize: 8},
        ],
        protocolDeviations: [],
      },
    });
    measurementSha = sha256(await readFile(
      resolver.resolveIntelArtifactPath(
        "Hades II",
        "Historical Human Sessions",
      ).absolutePath,
    ));
  }

  await artifacts.saveIntel({
    target: "Hades II",
    id: "Historical Experiment Outcome",
    sourceTool: "manual",
    observedAt: "2026-08-11T13:30:00.000Z",
    payload: {
      schemaVersion: 1,
      artifactType: "experiment-outcome",
      experimentId: "store-promise-001",
      targetId: "hades-ii",
      specRef: {
        target: "hades-ii",
        id: "historical-experiment-spec",
        sha256: variant === "broken-hash" ? "f".repeat(64) : historicalSpecEvidence.sha256,
      },
      predictionRunRef: {
        target: "hades-ii",
        runId: RUN_ID,
        runArtifactSha256: predictionMetadata.sha256,
        canonicalRecordSha256: predictionRead.record.seal!.canonicalSha256,
      },
      measurementEvidence: variant === "missing" ? [] : [{
        ref: "human-sessions",
        target: "hades-ii",
        id: "historical-human-sessions",
        sha256: measurementSha,
        metricId: "qualified-wishlist-intent",
        source: "human-playtest",
      }],
      results: variant === "missing" ? [{
        metricId: "qualified-wishlist-intent",
        scenarioId: "proposal",
        status: "missing",
        source: "human-playtest",
        instrument: "moderated store-page interview v1",
        unit: "ordinal-response",
        aggregation: "median",
        cohort: "Japanese action roguelike players",
        window: "first 30 seconds",
        sampleSize: 0,
        evidenceRefs: [],
      }] : [
        {
          metricId: "qualified-wishlist-intent",
          scenarioId: "current",
          status: "observed",
          source: "human-playtest",
          instrument: "moderated store-page interview v1",
          unit: "ordinal-response",
          aggregation: "median",
          cohort: "Japanese action roguelike players",
          window: "first 30 seconds",
          value: 2,
          sampleSize: 8,
          evidenceRefs: ["human-sessions"],
        },
        {
          metricId: "qualified-wishlist-intent",
          scenarioId: "proposal",
          status: "observed",
          source: "human-playtest",
          instrument: "moderated store-page interview v1",
          unit: "ordinal-response",
          aggregation: "median",
          cohort: "Japanese action roguelike players",
          window: "first 30 seconds",
          value: 4,
          sampleSize: 8,
          evidenceRefs: ["human-sessions"],
        },
      ],
      criterionVerdicts: [{
        criterionId: "intent-improves",
        verdict: variant === "missing" ? "unresolved" : "met",
      }],
      guardrailVerdicts: [],
      overallVerdict: variant === "missing" ? "unresolved" : "success",
      deviations: [],
      learnings: [{
        claim: variant === "missing"
          ? "The measurement remains unresolved"
          : "Observed lift exceeded the forecast",
        basis: variant === "missing" ? "No completed sessions" : "human-sessions",
        nextAction: "Use this bounded result in the next preregistered loop",
      }],
    },
  });
  await artifacts.saveIntel({
    target: "Hades II",
    id: "Next Experiment Spec",
    sourceTool: "manual",
    observedAt: "2026-08-11T14:00:00.000Z",
    payload: experimentSpec({
      experimentId: "store-promise-002",
      parentOutcomeRef: {
        target: "hades-ii",
        id: "historical-experiment-outcome",
      },
    }),
  });

  const calibrationRefs = ["next-spec", "prior-outcome"];
  const currentInput = runInput({
    evidence: [
      {
        ref: "next-spec",
        kind: "intel",
        target: "Hades II",
        id: "Next Experiment Spec",
      },
      {
        ref: "prior-outcome",
        kind: "intel",
        target: "Hades II",
        id: "Historical Experiment Outcome",
      },
      ...(variant === "missing" ? [] : [{
        ref: "human-sessions" as const,
        kind: "intel" as const,
        target: "Hades II",
        id: "Historical Human Sessions",
      }]),
      ...runInput().evidence,
    ],
    rounds: runInput().rounds.map((round) => ({
      ...round,
      evidenceRefs: [
        ...round.evidenceRefs,
        ...calibrationRefs,
        ...(variant === "missing" ? [] : ["human-sessions"]),
      ],
    })),
    confidence: {
      level: "medium",
      basis: "Bounded to the matching historical protocol and one forecast",
      calibrationStatus: variant === "verified" ? "calibrated" : "partially-calibrated",
    },
  });
  const currentStore = createRunStore(resolver, {
    clock: () => new Date("2026-08-11T15:00:00.000Z"),
    idFactory: () => CALIBRATED_RUN_ID,
  });
  await currentStore.saveRun(currentInput);
  return currentStore.readRun("Hades II", CALIBRATED_RUN_ID);
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
      simulationReadinessStatus: "rehearsal",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(read.metadata).toEqual(saved);
    expect(read.record).toMatchObject({
      schemaVersion: 3,
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
      simulationReadiness: {
        status: "rehearsal",
        serverAssessed: true,
        populationRepresentativeness: "not-established",
        scenarioComparison: "paired-coverage",
        interventionIsolation: "not-verified",
        heldOutValidation: {
          status: "absent",
          experimentSpecRefs: [],
          matchedExperimentSpecRefs: [],
          experimentOutcomeRefs: [],
        },
        calibration: {
          clientReportedStatus: "not-calibrated",
          serverVerified: false,
        },
        allowedClaims: [
          "issue-hypothesis",
          "directional-response-hypothesis",
          "test-priority",
        ],
        blockedClaims: [
          "population-rate",
          "market-share",
          "causal-lift",
          "retention-impact",
        ],
        reasons: expect.arrayContaining([
          "No ExperimentSpec evidence is linked to this run.",
          "Population representativeness is not established.",
          "Held-out outcome calibration is not server-verified.",
        ]),
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

  it("marks a run validation-ready only with a matching ExperimentSpec", async () => {
    const {artifacts, store} = await harness();
    await artifacts.saveIntel({
      target: "Hades II",
      id: "Experiment Spec",
      sourceTool: "manual",
      observedAt: "2026-08-11T10:30:00.000Z",
      payload: experimentSpec(),
    });
    const input = runInput({
      evidence: [
        {ref: "experiment-spec", kind: "intel", target: "Hades II", id: "Experiment Spec"},
        ...runInput().evidence,
      ],
      rounds: runInput().rounds.map((round) => ({
        ...round,
        evidenceRefs: [...round.evidenceRefs, "experiment-spec"],
      })),
    });

    await store.saveRun(input);
    const read = await store.readRun("Hades II", RUN_ID);

    expect(read.metadata.simulationReadinessStatus).toBe("validation-ready");
    expect(read.record.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ref: "experiment-spec",
        artifactType: "experiment-spec",
      }),
    ]));
    expect(read.record.simulationReadiness).toMatchObject({
      status: "validation-ready",
      serverAssessed: true,
      scenarioComparison: "paired-coverage",
      heldOutValidation: {
        status: "planned",
        experimentSpecRefs: ["experiment-spec"],
        matchedExperimentSpecRefs: ["experiment-spec"],
        experimentOutcomeRefs: [],
      },
      calibration: {
        clientReportedStatus: "not-calibrated",
        serverVerified: false,
      },
      allowedClaims: [
        "issue-hypothesis",
        "directional-response-hypothesis",
        "test-priority",
        "preregistered-prediction",
      ],
    });
  });

  it("keeps a matching spec in rehearsal until every required analysis phase uses it", async () => {
    const {artifacts, store} = await harness();
    await artifacts.saveIntel({
      target: "Hades II",
      id: "Underused Experiment Spec",
      sourceTool: "manual",
      observedAt: "2026-08-11T10:30:00.000Z",
      payload: experimentSpec(),
    });
    await store.saveRun(runInput({
      evidence: [
        {
          ref: "underused-spec",
          kind: "intel",
          target: "Hades II",
          id: "Underused Experiment Spec",
        },
        ...runInput().evidence,
      ],
      rounds: runInput().rounds.map((round, index) => index === 0
        ? {...round, evidenceRefs: [...round.evidenceRefs, "underused-spec"]}
        : round),
    }));

    const read = await store.readRun("Hades II", RUN_ID);
    expect(read.record.simulationReadiness).toMatchObject({
      status: "rehearsal",
      heldOutValidation: {
        status: "invalid-plan",
        experimentSpecRefs: ["underused-spec"],
        matchedExperimentSpecRefs: [],
      },
    });
  });

  it("keeps mismatched plans and client calibration claims in rehearsal", async () => {
    const {artifacts, store} = await harness();
    await artifacts.saveIntel({
      target: "Hades II",
      id: "Mismatched Experiment Spec",
      sourceTool: "manual",
      observedAt: "2026-08-11T10:30:00.000Z",
      payload: experimentSpec({
        plannedScenarios: [{
          id: "other",
          label: "Other",
          specification: "A different intervention",
        }],
      }),
    });
    const input = runInput({
      evidence: [
        {
          ref: "mismatched-spec",
          kind: "intel",
          target: "Hades II",
          id: "Mismatched Experiment Spec",
        },
        ...runInput().evidence,
      ],
      rounds: runInput().rounds.map((round) => ({
        ...round,
        evidenceRefs: [...round.evidenceRefs, "mismatched-spec"],
      })),
      confidence: {
        level: "high",
        basis: "Client claims calibration without a server-verified outcome chain",
        calibrationStatus: "calibrated",
      },
    });

    await store.saveRun(input);
    const read = await store.readRun("Hades II", RUN_ID);

    expect(read.record.simulationReadiness).toMatchObject({
      status: "rehearsal",
      heldOutValidation: {
        status: "invalid-plan",
        experimentSpecRefs: ["mismatched-spec"],
        matchedExperimentSpecRefs: [],
      },
      calibration: {
        clientReportedStatus: "calibrated",
        serverVerified: false,
      },
      blockedClaims: expect.arrayContaining(["causal-lift", "retention-impact"]),
    });
  });

  it("server-verifies a hash-linked prior forecast against raw measurements", async () => {
    const read = await calibrationHarness("verified");

    expect(read.record.schemaVersion).toBe(3);
    expect(read.record.simulationReadiness).toMatchObject({
      status: "validation-ready",
      heldOutValidation: {
        status: "planned",
        matchedExperimentSpecRefs: ["next-spec"],
        experimentOutcomeRefs: ["prior-outcome"],
        verifiedExperimentOutcomeRefs: ["prior-outcome"],
      },
      calibration: {
        clientReportedStatus: "calibrated",
        serverVerified: true,
        outcomeChecks: [{ref: "prior-outcome", status: "verified", issues: []}],
        forecastComparisons: [expect.objectContaining({
          outcomeRef: "prior-outcome",
          experimentId: "store-promise-001",
          metricId: "qualified-wishlist-intent",
          kind: "delta",
          predicted: 1,
          observed: 2,
          signedError: 1,
          absoluteError: 1,
          sampleSize: 8,
          referenceSampleSize: 8,
          aggregation: "median",
        })],
      },
      allowedClaims: expect.arrayContaining([
        "preregistered-prediction",
        "validated-forecast-error",
      ]),
      blockedClaims: expect.arrayContaining(["population-rate", "causal-lift"]),
    });
    expect(read.integrity.status).toBe("verified");
  });

  it("rejects a broken Outcome hash chain even when the client claims calibration", async () => {
    const read = await calibrationHarness("broken-hash");

    expect(read.record.simulationReadiness.calibration).toMatchObject({
      clientReportedStatus: "partially-calibrated",
      serverVerified: false,
      outcomeChecks: [{
        ref: "prior-outcome",
        status: "invalid",
        issues: expect.arrayContaining([
          "Historical ExperimentSpec SHA-256 does not match Outcome specRef.",
        ]),
      }],
      forecastComparisons: [],
    });
    expect(
      read.record.simulationReadiness.heldOutValidation.verifiedExperimentOutcomeRefs,
    ).toEqual([]);
    expect(read.record.simulationReadiness.allowedClaims).not.toContain(
      "validated-forecast-error",
    );
  });

  it("keeps a valid but missing primary result explicitly unresolved", async () => {
    const read = await calibrationHarness("missing");

    expect(read.record.simulationReadiness.calibration).toMatchObject({
      serverVerified: false,
      outcomeChecks: [{
        ref: "prior-outcome",
        status: "unresolved",
        issues: [
          "Primary result qualified-wishlist-intent/proposal is not observed.",
          "Primary result qualified-wishlist-intent/current is not observed.",
        ],
      }],
      forecastComparisons: [],
    });
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
