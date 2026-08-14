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
import type {Persona} from "./persona-schemas.js";
import {createPersonaStore} from "./persona-store.js";
import {createPathResolver} from "./paths.js";
import {compileRunSimRecipe} from "./run-recipe.js";
import {
  MAX_RUN_BYTES,
  SaveRunInputSchema,
  type SaveRunInput,
} from "./run-schemas.js";
import {createRunStore} from "./runs.js";

const roots: string[] = [];
const NOW = new Date("2026-08-11T12:34:56.000Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const CALIBRATED_RUN_ID = "22222222-2222-4222-8222-222222222222";
const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

const REQUIRED_INDIE_SECTIONS = [
  "Indie Strategy Card",
  "Core Experience Map",
  "Concept Origin Route",
  "Reward Mechanism Trace",
  "Moment-to-Moment Experience Loop",
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
  "Capability Reinvestment Gate",
  "Repair Backlog",
  "Experiment Queue",
  "Survival Scenarios",
] as const;

function evaluationMarkdown(detail: string, detailedIndie = false): string {
  const detailedSection = (heading: string): string[] => {
    if (heading === "Mechanism Transfer Map") {
      return [`### ${heading}`, "適用外: No imitation frame or mechanism transfer applies."];
    }
    if (heading === "Repair Backlog") {
      return [
        `### ${heading}`,
        [
          "| Priority | Blocking failure | Evidence ID | Owner surface | Success gate | Must not change |",
          "|---|---|---|---|---|---|",
          "| 1 | Fixture evidence is synthetic | E-001 | test harness | persistence succeeds | integrity checks |",
        ].join("\n"),
      ];
    }
    if (heading === "Capability Reinvestment Gate") {
      return [
        `### ${heading}`,
        [
          "| Decision | Bottleneck | Evidence ID | Capacity / runway boundary | Reversible next step | Expansion trigger |",
          "|---|---|---|---|---|---|",
          "| defer | Fixture evidence is synthetic | E-001 | Capacity and runway are missing | Preserve current scope | Real player evidence identifies a bottleneck |",
        ].join("\n"),
      ];
    }
    if (heading === "Experiment Queue") {
      return [
        `### ${heading}`,
        [
          "| Priority | Hypothesis | Stage | Primary metric | Source | Guardrail | Smallest build / asset | Experiment ID |",
          "|---|---|---|---|---|---|---|---|",
          "| 1 | The persisted fixture remains readable | prototype | integrity status | run-readback | no hash mismatch | one fixture | fixture-readback-01 |",
        ].join("\n"),
      ];
    }
    if (heading === "Survival Scenarios") {
      return [
        `### ${heading}`,
        [
          "| Scenario | Revenue assumptions | Cost / fee / refund / tax assumptions | Runway impact | Decision |",
          "|---|---|---|---|---|",
          "| conservative | missing | missing | missing | hold |",
          "| base | missing | missing | missing | hold |",
          "| upside | missing | missing | missing | validate |",
        ].join("\n"),
      ];
    }
    return [`### ${heading}`, `${heading} evidence.`];
  };
  const indieBody = detailedIndie
    ? [
      "This developer project requires the full indie strategy trace.",
      ...REQUIRED_INDIE_SECTIONS.flatMap(detailedSection),
    ]
    : ["適用外: This fixture tests run persistence only."];
  return [
    "# Evaluation",
    "- Mode: change",
    "- Selected Domains: storefront, UI",
    "## Decision Card", detail,
    "## Detailed Scope", "Run-store integration fixture.",
    "## Indie Survival Strategy", ...indieBody,
    "## Overall Assessment", "Synthetic assessment.",
    "## Who Plays and Why — Flow Analysis", "Synthetic player flow.",
    "## Flow Summary", "Synthetic flow summary.",
    "## Domain Findings", "Synthetic domain finding.",
    "## Data Semantics", "Synthetic data semantics.",
    "## Data Coverage Matrix",
    [
      "| Domain | Dimension | Status | Evidence IDs | Limitation / mismatch | Decision impact |",
      "|---|---|---|---|---|---|",
      "| storefront | copy and metadata | missing | なし | synthetic fixture | no product claim |",
      "| storefront | visual promise | missing | なし | synthetic fixture | no product claim |",
      "| storefront | expectation match | missing | なし | synthetic fixture | no product claim |",
      "| storefront | competitor context | missing | なし | synthetic fixture | no product claim |",
      "| ui | target task state | missing | なし | synthetic fixture | no product claim |",
      "| ui | matched cohort | missing | なし | synthetic fixture | no product claim |",
      "| ui | provenance | missing | なし | synthetic fixture | no product claim |",
      "| ui | interaction flow | missing | なし | synthetic fixture | no product claim |",
      "| ui | localization and accessibility state | missing | なし | synthetic fixture | no product claim |",
    ].join("\n"),
    [
      "| Scope | Applicable dimensions | Observed | Reported-zero | Estimated | Missing | Coverage rate | Direct observation rate |",
      "|---|---|---|---|---|---|---|---|",
      "| storefront | 4 | 0 | 0 | 0 | 4 | 0.0% | 0.0% |",
      "| ui | 5 | 0 | 0 | 0 | 5 | 0.0% | 0.0% |",
      "| overall | 9 | 0 | 0 | 0 | 9 | 0.0% | 0.0% |",
    ].join("\n"),
    "Blocking missing dimensions: all fixture dimensions are intentionally missing.",
    "## Evidence Index",
    [
      "| Evidence ID | artifact repository-relative path | observedAt | source | Data status / warning |",
      "|---|---|---|---|---|",
      "| E-001 | `knowledge/intel/hades-ii/snapshot.json` | 2026-08-11T12:34:56.000Z | manual | observed; synthetic fixture |",
    ].join("\n"),
    "## Final Recommendation", detail,
  ].join("\n\n");
}

function projectBriefFixture() {
  return {
    revisionId: "brief-v1",
    developmentStage: "prototype" as const,
    conceptOrigin: "theme-first" as const,
    targetPlayer: "players who enjoy readable tactical planning",
    themeWorld: "a storm-bound courier guild",
    distinctiveSystem: "redraw routes against a changing forecast",
    primaryIntendedFeeling: "tense anticipation turning into earned relief",
    shortestRepeatableLoop: "read one forecast, choose one route, commit, and read the result",
    systemResponse: "wind and cargo state react to the committed route",
    rewardMechanisms: [{
      family: "mastery" as const,
      form: "mixed" as const,
      beforeState: "the safe route is uncertain",
      playerAction: "read the forecast and commit to a route",
      systemResponse: "wind and cargo state react immediately",
      afterState: "the prediction is proven viable or visibly fails",
      perceivedReward: "a correct read becomes a successful delivery",
      amplifier: "storm audio and vehicle motion",
    }],
    oneSentencePromise: "Outread the storm to keep a fragile courier network alive",
    coreProofMoment: "A route is redrawn around a storm and the delivery state reacts immediately",
  };
}

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
    schema_version: 2,
    target_context: {
      market: "Japan",
      language: "japanese",
      source_roles: [{appid: 1145350, role: "target"}],
    },
    decision_profile: {
      adoption_trigger: "The first combat decision and result are readable",
      retention_trigger: "Combat choices continue to create distinct outcomes",
      churn_trigger: "The action or result becomes visually ambiguous",
      update_reaction: "Reassess after a readability update is demonstrated",
    },
    evidence_basis: {
      observed_patterns: [
        {
          claim: "Combat readability affects adoption",
          evidence: [{source_appid: 1145350, recommendation_id: "rec-1"}],
        },
        {
          claim: "Unreadable feedback is a dealbreaker",
          evidence: [{source_appid: 1145350, recommendation_id: "rec-3"}],
        },
      ],
      inferred_traits: [],
      limitations: ["The review-grounded persona does not establish population share"],
      overall_confidence: "medium",
    },
  };
}

function playerSimulation(recommendationId = "rec-1") {
  return {
    exposure: "visual-evidence" as const,
    memory: {
      voiceEvidence: [{sourceAppid: 1145350, recommendationId}],
    },
    perception: {
      expectation: "Combat readability should be visible before purchase.",
      noticedSignals: ["The capsule presents a combat-focused promise."],
      unclearSignals: ["The exact input-to-impact loop is not visible."],
    },
    decision: {
      action: "Inspect the combat frame before deciding whether to try the game.",
      reason: "Readable combat is this persona's highest-priority adoption signal.",
    },
    response: {
      predictedFeeling: {
        before: "Cautious because the combat promise is still abstract.",
        after: "Interested but still waiting for a legible combat result.",
      },
      frictions: ["The core interaction remains implicit."],
      rewardSignals: ["The combat hierarchy looks deliberate."],
      continuation: "uncertain" as const,
      continuationReason: "A playable proof moment is still missing.",
    },
    reflection: {
      confidence: "medium" as const,
      uncertainties: ["No human response to this exact capsule was observed."],
      humanValidationQuestion: "What do you expect to do in the first combat encounter?",
      observableSignal: "An unaided participant identifies the action and expected result.",
    },
  };
}

function runRecipeFixture(): string {
  return [
    "<!-- GPL:section core -->",
    "# run-sim\n\nEvidence-grounded simulation recipe.",
    "<!-- GPL:end -->",
    "<!-- GPL:section subject:existing-game -->",
    "Existing-game test contract.",
    "<!-- GPL:end -->",
    "<!-- GPL:section subject:developer -->",
    "Developer test contract.",
    "<!-- GPL:end -->",
    ...["gameplay", "storefront", "ui", "price", "localization", "competition"].flatMap(
      (domain) => [
        `<!-- GPL:section domain:${domain} -->`,
        `${domain} test contract.`,
        "<!-- GPL:end -->",
      ],
    ),
  ].join("\n");
}

async function harness(
  clock: () => Date = () => NOW,
  recipe = runRecipeFixture(),
) {
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
  await writeFile(join(root, "skills", "run-sim.md"), recipe);
  const resolver = createPathResolver(root);
  const artifacts = createArtifactStore(resolver, {clock});
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
    content: evaluationMarkdown("Current versus proposal."),
  });
  await createPersonaStore(resolver).savePersona(persona());
  await writeFile(
    resolver.resolveCaptureReadPath("Store Hero").absolutePath,
    PNG_BYTES,
  );
  const store = createRunStore(resolver, {
    clock,
    idFactory: () => RUN_ID,
  });
  return {
    artifacts,
    recipe: compileRunSimRecipe(recipe, {
      subjectKind: "existing-game",
      selectedDomains: ["storefront", "ui"],
    }),
    resolver,
    root,
    store,
  };
}

function runInput(overrides: Partial<SaveRunInput> = {}): SaveRunInput {
  return {
    target: "Hades II",
    topic: "Store page proposition",
    subjectKind: "existing-game",
    market: "Japan",
    language: "japanese",
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
        playerSimulation: playerSimulation(),
        output: "The current promise is readable but generic.",
        evidenceRefs: ["profile", "hero"],
      },
      {
        sequence: 2,
        phase: "persona",
        actor: "jp-skeptic",
        personaId: "jp-skeptic",
        scenarioId: "proposal",
        playerSimulation: playerSimulation("rec-2"),
        output: "The proposal is clearer but still needs validation.",
        evidenceRefs: ["profile", "hero"],
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
  variant: "verified" | "broken-hash" | "missing" | "contradictory" | "backdated-next-spec",
) {
  let serverNow = NOW;
  const context = await harness(() => serverNow);
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

  const saveNextSpec = () => artifacts.saveIntel({
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
  if (variant === "backdated-next-spec") {
    serverNow = new Date("2026-08-11T12:40:00.000Z");
    await saveNextSpec();
    serverNow = new Date("2026-08-11T12:45:00.000Z");
  }

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
        verdict: variant === "missing"
          ? "unresolved"
          : variant === "contradictory"
            ? "not-met"
            : "met",
      }],
      guardrailVerdicts: [],
      overallVerdict: variant === "missing"
        ? "unresolved"
        : variant === "contradictory"
          ? "failure"
          : "success",
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
  if (variant !== "backdated-next-spec") await saveNextSpec();

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
      calibrationStatus: variant === "verified" || variant === "contradictory"
        ? "calibrated"
        : "partially-calibrated",
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

  it("requires consultation context and a route-complete brief for developer subjects", () => {
    const {subjectKind: _subjectKind, ...withoutSubjectKind} = runInput();
    expect(SaveRunInputSchema.safeParse(withoutSubjectKind).success).toBe(false);

    const developerWithoutBrief = SaveRunInputSchema.safeParse(runInput({
      subjectKind: "developer-project",
    }));
    expect(developerWithoutBrief.success).toBe(false);
    if (!developerWithoutBrief.success) {
      expect(developerWithoutBrief.error.issues.map((issue) => issue.message).join(" "))
        .toContain("projectBrief");
    }

    const {coreProofMoment: _coreProofMoment, ...withoutCoreProofMoment} = projectBriefFixture();
    const developerWithoutProof = SaveRunInputSchema.safeParse(runInput({
      subjectKind: "developer-project",
      projectBrief: withoutCoreProofMoment,
    }));
    expect(developerWithoutProof.success).toBe(false);
    if (!developerWithoutProof.success) {
      expect(developerWithoutProof.error.issues.map((issue) => issue.path.join(".")).join(" "))
        .toContain("projectBrief.coreProofMoment");
    }

    expect(() => SaveRunInputSchema.parse(runInput({
      subjectKind: "developer-project",
      projectBrief: projectBriefFixture(),
    }))).not.toThrow();

    const {primaryIntendedFeeling: _primaryIntendedFeeling, ...withoutPrimaryFeeling} = projectBriefFixture();
    const developerWithoutFeeling = SaveRunInputSchema.safeParse(runInput({
      subjectKind: "developer-project",
      projectBrief: withoutPrimaryFeeling,
    }));
    expect(developerWithoutFeeling.success).toBe(false);
    if (!developerWithoutFeeling.success) {
      expect(developerWithoutFeeling.error.issues.map((issue) => issue.path.join(".")).join(" "))
        .toContain("projectBrief.primaryIntendedFeeling");
    }
  });
});

describe("run store", () => {
  it("requires a structured player simulation for every persona round", () => {
    const input = runInput() as unknown as {rounds: Array<Record<string, unknown>>};
    delete input.rounds[0]?.playerSimulation;

    const parsed = SaveRunInputSchema.safeParse(input);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message).join(" "))
        .toMatch(/persona rounds require a structured player simulation/i);
    }
  });

  it("rejects player simulations that cite voice evidence outside the persona", async () => {
    const {store} = await harness();
    const input = runInput();
    const simulation = input.rounds[0]?.playerSimulation;
    if (!simulation) throw new Error("fixture player simulation is missing");
    simulation.memory.voiceEvidence = [{
      sourceAppid: 1145350,
      recommendationId: "not-in-persona",
    }];

    await expect(store.saveRun(input)).rejects.toThrow(
      /voice evidence is not present in persona/i,
    );
  });

  it("seals and revalidates the exact subject/domain-compiled recipe", async () => {
    const source = await readFile(new URL("../skills/run-sim.md", import.meta.url), "utf8");
    const {resolver, store} = await harness(() => NOW, source);

    await store.saveRun(runInput());
    const initial = await store.readRun("Hades II", RUN_ID);
    const compiled = compileRunSimRecipe(source, {
      subjectKind: "existing-game",
      selectedDomains: ["storefront", "ui"],
    });
    expect(initial.record.recipe.sha256).toBe(sha256(compiled));
    expect(initial.integrity.status).toBe("verified");

    await writeFile(
      resolver.resolveSkillPath("run-sim.md"),
      source.replace("UI domain contract", "Changed UI domain contract"),
    );
    const drifted = await store.readRun("Hades II", RUN_ID);
    expect(drifted.integrity).toMatchObject({
      status: "failed",
      dependencies: expect.arrayContaining([
        expect.objectContaining({type: "recipe", status: "mismatch"}),
      ]),
    });
  });

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
      schemaVersion: 7,
      runId: RUN_ID,
      targetId: "hades-ii",
      subjectKind: "existing-game",
      market: "Japan",
      language: "japanese",
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
    expect(read.record.rounds[0]?.playerSimulation).toMatchObject({
      exposure: "visual-evidence",
      memory: {
        voiceEvidence: [{sourceAppid: 1145350, recommendationId: "rec-1"}],
      },
      decision: {
        action: "Inspect the combat frame before deciding whether to try the game.",
      },
      response: {continuation: "uncertain"},
      reflection: {confidence: "medium"},
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

  it("rejects a final evaluation whose Selected Domains differ from the run", async () => {
    const {artifacts, store} = await harness();
    const storefrontOnly = evaluationMarkdown("Current versus proposal.")
      .replace("- Selected Domains: storefront, UI", "- Selected Domains: storefront")
      .split("\n")
      .filter((line) => !line.startsWith("| ui |"))
      .join("\n")
      .replace(
        "| overall | 9 | 0 | 0 | 0 | 9 | 0.0% | 0.0% |",
        "| overall | 4 | 0 | 0 | 0 | 4 | 0.0% | 0.0% |",
      );
    await artifacts.saveEvaluation({
      target: "Hades II",
      topic: "Store Page",
      date: "2026-08-11",
      content: storefrontOnly,
    }, true);

    await expect(store.saveRun(runInput())).rejects.toThrow(
      /selectedDomains.*final evaluation/i,
    );
  });

  it("rejects an indie-strategy N/A final evaluation for a developer project", async () => {
    const {artifacts, store} = await harness();
    const developerRun = runInput({
      subjectKind: "developer-project",
      projectBrief: projectBriefFixture(),
    });

    await expect(store.saveRun(developerRun)).rejects.toThrow(/Indie Survival Strategy/i);

    await artifacts.saveEvaluation({
      target: "Hades II",
      topic: "Store Page",
      date: "2026-08-11",
      content: evaluationMarkdown("Current versus proposal.", true),
    }, true);
    await expect(store.saveRun(developerRun)).resolves.toMatchObject({id: RUN_ID});
    await expect(store.readRun("Hades II", RUN_ID)).resolves.toMatchObject({
      record: {
        schemaVersion: 7,
        subjectKind: "developer-project",
        projectBrief: {
          revisionId: "brief-v1",
          coreProofMoment: "A route is redrawn around a storm and the delivery state reacts immediately",
        },
        evidence: expect.arrayContaining([
          expect.objectContaining({
            ref: "evaluation",
            indieStrategyMode: "detailed",
          }),
        ]),
      },
    });
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

    expect(read.record.schemaVersion).toBe(7);
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
      experimentDecisions: [{
        outcomeRef: "prior-outcome",
        status: "verified",
        experimentId: "store-promise-001",
        successCriteria: [expect.objectContaining({
          criterionId: "intent-improves",
          observed: 2,
          verdict: "met",
          issues: [],
        })],
        guardrails: [],
        serverOverallVerdict: "success",
        recommendedAction: "consider-adoption-within-tested-scope",
        reportedOverallVerdict: "success",
        reportedVerdictsMatch: true,
      }],
      allowedClaims: expect.arrayContaining([
        "preregistered-prediction",
        "validated-forecast-error",
        "verified-experiment-decision",
      ]),
      blockedClaims: expect.arrayContaining(["population-rate", "causal-lift"]),
    });
    expect(read.integrity.status).toBe("verified");
  });

  it("rejects client timestamps that hide an invalid server save order", async () => {
    const read = await calibrationHarness("backdated-next-spec");

    expect(read.record.simulationReadiness.calibration).toMatchObject({
      serverVerified: false,
      outcomeChecks: [{
        ref: "prior-outcome",
        status: "invalid",
        issues: expect.arrayContaining([
          "Current ExperimentSpec must be saved at or after its parent Outcome.",
        ]),
      }],
      forecastComparisons: [],
    });
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
    expect(read.record.simulationReadiness.experimentDecisions).toEqual([]);
    expect(
      read.record.simulationReadiness.heldOutValidation.verifiedExperimentOutcomeRefs,
    ).toEqual([]);
    expect(read.record.simulationReadiness.allowedClaims).not.toContain(
      "validated-forecast-error",
    );
  });

  it("keeps the server decision when the Outcome reports the opposite verdict", async () => {
    const read = await calibrationHarness("contradictory");

    expect(read.record.simulationReadiness.calibration.serverVerified).toBe(true);
    expect(read.record.simulationReadiness.experimentDecisions).toMatchObject([{
      status: "verified",
      serverOverallVerdict: "success",
      recommendedAction: "consider-adoption-within-tested-scope",
      reportedOverallVerdict: "failure",
      reportedVerdictsMatch: false,
      successCriteria: [{observed: 2, verdict: "met", issues: []}],
    }]);
    expect(read.record.simulationReadiness.allowedClaims).toContain(
      "verified-experiment-decision",
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
    expect(read.record.simulationReadiness.experimentDecisions).toMatchObject([{
      outcomeRef: "prior-outcome",
      status: "unresolved",
      serverOverallVerdict: "unresolved",
      recommendedAction: "collect-missing-evidence",
      reportedOverallVerdict: "unresolved",
      reportedVerdictsMatch: true,
      successCriteria: [{
        verdict: "unresolved",
        issues: expect.arrayContaining([
          "Criterion result qualified-wishlist-intent/proposal is not observed.",
          "Criterion result qualified-wishlist-intent/current is not observed.",
        ]),
      }],
    }]);
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

  it("reports missing dependencies", async () => {
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
  });

  it.each(["seal", "coverage"])(
    "rejects a current run record with stripped %s integrity data",
    async (field) => {
      const {resolver, store} = await harness();
      await store.saveRun(runInput());
      const path = resolver.resolveRunPath("Hades II", RUN_ID).absolutePath;
      const record = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      delete record[field];
      await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);

      await expect(store.readRun("Hades II", RUN_ID)).rejects.toThrow(/run schema/i);
    },
  );

  it("rejects symlinked workspace targets while listing", async () => {
    const {root, store} = await harness();
    const outside = join(root, "outside-target");
    await mkdir(outside);
    await symlink(outside, join(root, "workspaces", "linked-target"));

    await expect(store.listTargets()).rejects.toThrow(/symlink run targets/i);
  });
});
