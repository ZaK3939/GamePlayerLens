import {z} from "zod";
import {SourceToolSchema} from "./artifacts.js";
import {EVALUATION_DOMAINS} from "./evaluation-coverage.js";
import {
  buildProjectBriefDiagnostics,
  ProjectBriefObjectSchema,
  SubjectKindSchema,
} from "./project-brief.js";

export const MAX_RUN_BYTES = 2 * 1024 * 1024;
export const RUN_RECIPE_ID = "run-sim.md";

export const RunIdSchema = z.uuid();
export const SimulationModeSchema = z.enum(["baseline", "change"]);
export const SimulationDomainSchema = z.enum(EVALUATION_DOMAINS);
export type SimulationDomain = z.infer<typeof SimulationDomainSchema>;
const ReferenceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
export const CanonicalTargetIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const IsoDateTimeSchema = z.iso.datetime({offset: true});
const ConsultationTextSchema = z.string().trim().min(1).max(200);

const ModelInputSchema = z.object({
  provider: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(120).optional(),
}).strict();

const ScenarioSchema = z.object({
  id: ReferenceIdSchema,
  label: z.string().trim().min(1).max(120),
  specification: z.string().min(1).max(50_000),
}).strict();

const PlayerSimulationTextSchema = z.string().trim().min(1).max(4_000);

const PersonaVoiceEvidenceReferenceSchema = z.object({
  sourceAppid: z.number().int().positive(),
  recommendationId: z.string().trim().min(1).max(200),
}).strict();

export const PlayerSimulationSchema = z.object({
  exposure: z.enum(["scenario-only", "visual-evidence", "ai-operated"]),
  stimulusEvidenceRefs: z.array(ReferenceIdSchema).max(8),
  memory: z.object({
    derivationEvidenceRef: ReferenceIdSchema,
    voiceEvidence: z.array(PersonaVoiceEvidenceReferenceSchema).min(1).max(5),
  }).strict(),
  perception: z.object({
    expectation: PlayerSimulationTextSchema,
    noticedSignals: z.array(PlayerSimulationTextSchema).min(1).max(8),
    unclearSignals: z.array(PlayerSimulationTextSchema).max(8),
  }).strict(),
  decision: z.object({
    action: PlayerSimulationTextSchema,
    reason: PlayerSimulationTextSchema,
  }).strict(),
  response: z.object({
    predictedFeeling: z.object({
      before: PlayerSimulationTextSchema,
      after: PlayerSimulationTextSchema,
    }).strict(),
    frictions: z.array(PlayerSimulationTextSchema).max(8),
    rewardSignals: z.array(PlayerSimulationTextSchema).max(8),
    continuation: z.enum(["continue", "stop", "uncertain"]),
    continuationReason: PlayerSimulationTextSchema,
  }).strict(),
  reflection: z.object({
    confidence: z.enum(["low", "medium", "high"]),
    uncertainties: z.array(PlayerSimulationTextSchema).min(1).max(8),
    humanValidationQuestion: PlayerSimulationTextSchema,
    observableSignal: PlayerSimulationTextSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.exposure === "scenario-only" && value.stimulusEvidenceRefs.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["stimulusEvidenceRefs"],
      message: "scenario-only player simulations cannot cite observed stimuli",
    });
  }
  if (value.exposure !== "scenario-only" && value.stimulusEvidenceRefs.length < 1) {
    context.addIssue({
      code: "custom",
      path: ["stimulusEvidenceRefs"],
      message: "observed player simulations require explicit stimulus evidence",
    });
  }
  if (new Set(value.stimulusEvidenceRefs).size !== value.stimulusEvidenceRefs.length) {
    context.addIssue({
      code: "custom",
      path: ["stimulusEvidenceRefs"],
      message: "player simulation stimulus evidence must be unique",
    });
  }
  const seen = new Set<string>();
  value.memory.voiceEvidence.forEach((reference, index) => {
    const key = `${reference.sourceAppid}:${reference.recommendationId}`;
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["memory", "voiceEvidence", index],
        message: "player simulation voice evidence must be unique",
      });
    }
    seen.add(key);
  });
});

export const EvidenceReferenceInputSchema = z.discriminatedUnion("kind", [
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("intel"),
    target: z.string().min(1),
    id: z.string().min(1),
  }).strict(),
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("evaluation"),
    target: z.string().min(1),
    id: z.string().min(1),
  }).strict(),
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("capture"),
    id: z.string().min(1),
  }).strict(),
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("ui-reference"),
    id: z.string().min(1),
  }).strict(),
]);

const SimulationRoundSchema = z.object({
  sequence: z.number().int().positive().max(1_000),
  phase: z.enum(["persona", "domain", "critic", "synthesis"]),
  actor: z.string().trim().min(1).max(120),
  scenarioId: ReferenceIdSchema.optional(),
  domain: SimulationDomainSchema.optional(),
  personaId: ReferenceIdSchema.optional(),
  playerSimulation: PlayerSimulationSchema.optional(),
  output: z.string().min(1).max(100_000),
  evidenceRefs: z.array(ReferenceIdSchema).min(1).max(50),
}).strict().superRefine((value, context) => {
  if (value.phase === "persona" && !value.playerSimulation) {
    context.addIssue({
      code: "custom",
      path: ["playerSimulation"],
      message: "persona rounds require a structured player simulation",
    });
  }
  if (value.phase !== "persona" && value.playerSimulation) {
    context.addIssue({
      code: "custom",
      path: ["playerSimulation"],
      message: "only persona rounds may contain a player simulation",
    });
  }
  if (value.phase === "persona" && value.personaId && value.actor !== value.personaId) {
    context.addIssue({
      code: "custom",
      path: ["actor"],
      message: "persona round actor must equal personaId",
    });
  }
  if (value.playerSimulation) {
    const explicitRefs = [
      value.playerSimulation.memory.derivationEvidenceRef,
      ...value.playerSimulation.stimulusEvidenceRefs,
    ];
    for (const reference of explicitRefs) {
      if (!value.evidenceRefs.includes(reference)) {
        context.addIssue({
          code: "custom",
          path: ["evidenceRefs"],
          message: `player simulation evidence is not cited by the round: ${reference}`,
        });
      }
    }
  }
});

const ConfidenceInputSchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  basis: z.string().trim().min(1).max(4_000),
  calibrationStatus: z.enum([
    "not-calibrated",
    "partially-calibrated",
    "calibrated",
  ]),
}).strict();

interface RelationShape {
  mode: z.infer<typeof SimulationModeSchema>;
  selectedDomains: Array<z.infer<typeof SimulationDomainSchema>>;
  scenarios: Array<z.infer<typeof ScenarioSchema>>;
  personaIds: string[];
  evidenceRefs: Array<{ref: string; kind: string}>;
  rounds: Array<z.infer<typeof SimulationRoundSchema>>;
  finalEvaluationRef: string;
}

function duplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function validateRelations(
  value: RelationShape,
  context: z.RefinementCtx,
): void {
  const issue = (path: Array<string | number>, message: string) => {
    context.addIssue({code: "custom", path, message});
  };
  if (value.mode === "baseline" && value.scenarios.length !== 1) {
    issue(["scenarios"], "baseline runs require exactly one scenario");
  }
  if (value.mode === "change" && value.scenarios.length < 2) {
    issue(["scenarios"], "change runs require at least two scenarios");
  }
  for (const [path, values] of [
    [["selectedDomains"], value.selectedDomains],
    [["scenarios"], value.scenarios.map((scenario) => scenario.id)],
    [["personaIds"], value.personaIds],
    [["evidence"], value.evidenceRefs.map((evidence) => evidence.ref)],
  ] as const) {
    const repeated = duplicate([...values]);
    if (repeated) issue([...path], `duplicate id: ${repeated}`);
  }

  const scenarioIds = new Set(value.scenarios.map((scenario) => scenario.id));
  const personaIds = new Set(value.personaIds);
  const evidenceIds = new Set(value.evidenceRefs.map((evidence) => evidence.ref));
  value.rounds.forEach((round, index) => {
    if (round.sequence !== index + 1) {
      issue(["rounds", index, "sequence"], "round sequences must be consecutive from 1");
    }
    if (round.scenarioId && !scenarioIds.has(round.scenarioId)) {
      issue(["rounds", index, "scenarioId"], "unknown scenario reference");
    }
    if (round.personaId && !personaIds.has(round.personaId)) {
      issue(["rounds", index, "personaId"], "unknown persona reference");
    }
    if (round.phase === "persona" && !round.personaId) {
      issue(["rounds", index, "personaId"], "persona rounds require a persona reference");
    }
    if (round.phase === "domain" && !round.domain) {
      issue(["rounds", index, "domain"], "domain rounds require a domain");
    }
    if (round.domain && !value.selectedDomains.includes(round.domain)) {
      issue(["rounds", index, "domain"], "round domain is outside the selected domains");
    }
    const repeatedEvidence = duplicate(round.evidenceRefs);
    if (repeatedEvidence) {
      issue(["rounds", index, "evidenceRefs"], `duplicate evidence: ${repeatedEvidence}`);
    }
    for (const reference of round.evidenceRefs) {
      if (!evidenceIds.has(reference)) {
        issue(["rounds", index, "evidenceRefs"], `unknown evidence reference: ${reference}`);
      }
    }
  });

  for (const scenarioId of scenarioIds) {
    if (!value.rounds.some((round) => round.scenarioId === scenarioId)) {
      issue(["rounds"], `scenario has no recorded round: ${scenarioId}`);
    }
  }
  for (const personaId of personaIds) {
    if (!value.rounds.some((round) =>
      round.phase === "persona" && round.personaId === personaId)) {
      issue(["rounds"], `persona has no recorded persona round: ${personaId}`);
    }
  }
  for (const domain of value.selectedDomains) {
    if (!value.rounds.some((round) =>
      round.phase === "domain" && round.domain === domain)) {
      issue(["rounds"], `selected domain has no recorded round: ${domain}`);
    }
  }
  for (const requiredPhase of ["critic", "synthesis"] as const) {
    if (!value.rounds.some((round) => round.phase === requiredPhase)) {
      issue(["rounds"], `simulation run requires a ${requiredPhase} round`);
    }
  }
  const finalEvidence = value.evidenceRefs.find(
    (evidence) => evidence.ref === value.finalEvaluationRef,
  );
  if (!finalEvidence || finalEvidence.kind !== "evaluation") {
    issue(["finalEvaluationRef"], "final evaluation must reference evaluation evidence");
  }
}

function validateSaveCompleteness(
  value: RelationShape,
  context: z.RefinementCtx,
): void {
  const issue = (path: Array<string | number>, message: string) => {
    context.addIssue({code: "custom", path, message});
  };
  for (const scenario of value.scenarios) {
    for (const domain of value.selectedDomains) {
      if (!value.rounds.some((round) =>
        round.phase === "domain"
        && round.scenarioId === scenario.id
        && round.domain === domain)) {
        issue(
          ["rounds"],
          `scenario/domain cell has no recorded round: ${scenario.id}/${domain}`,
        );
      }
    }
  }
  for (const personaId of value.personaIds) {
    for (const scenario of value.scenarios) {
      if (!value.rounds.some((round) =>
        round.phase === "persona"
        && round.personaId === personaId
        && round.scenarioId === scenario.id)) {
        issue(
          ["rounds"],
          `persona/scenario cell has no recorded round: ${personaId}/${scenario.id}`,
        );
      }
    }
  }

  value.rounds.forEach((round, index) => {
    if (round.evidenceRefs.includes(value.finalEvaluationRef)) {
      issue(
        ["rounds", index, "evidenceRefs"],
        "rounds cannot cite the final evaluation created after synthesis",
      );
    }
  });
  const usedEvidence = new Set(value.rounds.flatMap((round) => round.evidenceRefs));
  for (const evidence of value.evidenceRefs) {
    if (evidence.ref !== value.finalEvaluationRef && !usedEvidence.has(evidence.ref)) {
      issue(["evidence"], `analysis evidence is not used by any round: ${evidence.ref}`);
    }
  }
}

export const SaveRunInputBaseSchema = z.object({
  target: z.string().min(1),
  topic: z.string().trim().min(1).max(120),
  subjectKind: SubjectKindSchema,
  market: ConsultationTextSchema,
  language: ConsultationTextSchema,
  projectBrief: ProjectBriefObjectSchema.optional(),
  mode: SimulationModeSchema,
  selectedDomains: z.array(SimulationDomainSchema).min(1).max(6),
  model: ModelInputSchema,
  scenarios: z.array(ScenarioSchema).min(1).max(8),
  personaIds: z.array(ReferenceIdSchema).min(1).max(12),
  evidence: z.array(EvidenceReferenceInputSchema).min(1).max(100),
  rounds: z.array(SimulationRoundSchema).min(1).max(100),
  warnings: z.array(z.string().max(2_000)).max(100),
  confidence: ConfidenceInputSchema,
  finalEvaluationRef: ReferenceIdSchema,
}).strict();

function validateDeveloperProjectBrief(
  value: {
    subjectKind: z.infer<typeof SubjectKindSchema>;
    projectBrief?: z.infer<typeof ProjectBriefObjectSchema>;
  },
  context: z.RefinementCtx,
): void {
  if (value.subjectKind !== "developer-concept" && value.subjectKind !== "developer-project") {
    return;
  }
  if (!value.projectBrief) {
    context.addIssue({
      code: "custom",
      path: ["projectBrief"],
      message: "developer runs require projectBrief",
    });
    return;
  }
  const diagnostics = buildProjectBriefDiagnostics(value.projectBrief);
  const missingFields = [...new Set([
    ...diagnostics.conceptRoute.missingFields,
    ...diagnostics.rewardMechanism.missingFields,
    ...diagnostics.mechanismTransfer.missingFields,
  ])];
  for (const field of missingFields) {
    context.addIssue({
      code: "custom",
      path: ["projectBrief", field],
      message: `developer run projectBrief is missing route field: ${field}`,
    });
  }
}

export const SaveRunInputSchema = SaveRunInputBaseSchema.superRefine((value, context) => {
  const relations = {
    ...value,
    personaIds: value.personaIds,
    evidenceRefs: value.evidence,
  };
  validateRelations(relations, context);
  validateSaveCompleteness(relations, context);
  validateDeveloperProjectBrief(value, context);
});

export const ResolvedPersonaSchema = z.object({
  id: ReferenceIdSchema,
  path: z.string().min(1),
  sha256: Sha256Schema,
}).strict();

export const ResolvedEvidenceSchema = z.object({
  ref: ReferenceIdSchema,
  kind: z.enum(["intel", "evaluation", "capture", "ui-reference"]),
  targetId: CanonicalTargetIdSchema.optional(),
  id: z.string().min(1),
  path: z.string().min(1),
  sha256: Sha256Schema,
  sourceTool: SourceToolSchema.optional(),
  observedAt: IsoDateTimeSchema.optional(),
  savedAt: IsoDateTimeSchema.optional(),
  indieStrategyMode: z.enum(["detailed", "not-applicable"]).optional(),
  artifactType: z.enum([
    "experiment-spec",
    "experiment-measurement",
    "experiment-outcome",
  ]).optional(),
}).strict();

const SimulationClaimSchema = z.enum([
  "issue-hypothesis",
  "directional-response-hypothesis",
  "test-priority",
  "preregistered-prediction",
  "validated-forecast-error",
  "verified-experiment-decision",
  "population-rate",
  "market-share",
  "causal-lift",
  "retention-impact",
]);

const ForecastComparisonSchema = z.object({
  outcomeRef: ReferenceIdSchema,
  experimentId: ReferenceIdSchema,
  metricId: ReferenceIdSchema,
  kind: z.enum(["value", "delta"]),
  scenarioId: ReferenceIdSchema,
  referenceScenarioId: ReferenceIdSchema.optional(),
  predicted: z.number().finite(),
  observed: z.number().finite(),
  signedError: z.number().finite(),
  absoluteError: z.number().finite().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  referenceSampleSize: z.number().int().nonnegative().optional(),
  source: z.enum([
    "ai-playtest",
    "human-playtest",
    "telemetry",
    "steam-reviews",
    "store-metric",
    "manual-observation",
  ]),
  instrument: z.string().min(1).max(500),
  unit: z.string().min(1).max(120),
  aggregation: z.string().min(1).max(120),
  cohort: z.string().min(1).max(1_000),
  window: z.string().min(1).max(500),
}).strict();

const CriterionDecisionSchema = z.object({
  criterionId: ReferenceIdSchema,
  metricId: ReferenceIdSchema,
  scenarioId: ReferenceIdSchema,
  referenceScenarioId: ReferenceIdSchema.optional(),
  comparator: z.enum(["<", "<=", "=", ">=", ">"]),
  threshold: z.number().finite(),
  observed: z.number().finite().optional(),
  verdict: z.enum(["met", "not-met", "breached", "unresolved"]),
  issues: z.array(z.string().min(1).max(1_000)).max(20),
}).strict();

const ExperimentDecisionSchema = z.object({
  outcomeRef: ReferenceIdSchema,
  status: z.enum(["verified", "unresolved"]),
  experimentId: ReferenceIdSchema,
  successCriteria: z.array(CriterionDecisionSchema).min(1).max(50),
  guardrails: z.array(CriterionDecisionSchema).max(50),
  serverOverallVerdict: z.enum(["success", "failure", "stopped", "unresolved"]),
  recommendedAction: z.enum([
    "consider-adoption-within-tested-scope",
    "do-not-adopt-tested-change",
    "stop-and-investigate-guardrail",
    "collect-missing-evidence",
  ]),
  reportedOverallVerdict: z.enum(["success", "failure", "mixed", "stopped", "unresolved"]),
  reportedVerdictsMatch: z.boolean(),
}).strict();

export const SimulationReadinessSchema = z.object({
  status: z.enum(["rehearsal", "validation-ready"]),
  serverAssessed: z.literal(true),
  populationRepresentativeness: z.literal("not-established"),
  scenarioComparison: z.enum(["single-scenario", "paired-coverage"]),
  interventionIsolation: z.literal("not-verified"),
  heldOutValidation: z.object({
    status: z.enum(["absent", "invalid-plan", "ambiguous-plan", "planned"]),
    experimentSpecRefs: z.array(ReferenceIdSchema),
    matchedExperimentSpecRefs: z.array(ReferenceIdSchema),
    experimentOutcomeRefs: z.array(ReferenceIdSchema),
    verifiedExperimentOutcomeRefs: z.array(ReferenceIdSchema),
  }).strict(),
  calibration: z.object({
    clientReportedStatus: ConfidenceInputSchema.shape.calibrationStatus,
    serverVerified: z.boolean(),
    outcomeChecks: z.array(z.object({
      ref: ReferenceIdSchema,
      status: z.enum(["verified", "unresolved", "invalid"]),
      issues: z.array(z.string().min(1).max(1_000)).max(20),
    }).strict()).max(50),
    forecastComparisons: z.array(ForecastComparisonSchema).max(50),
  }).strict(),
  experimentDecisions: z.array(ExperimentDecisionSchema).max(50),
  allowedClaims: z.array(SimulationClaimSchema).min(1),
  blockedClaims: z.array(SimulationClaimSchema).min(1),
  reasons: z.array(z.string().min(1).max(1_000)).min(1).max(10),
}).strict();

const CoverageRatioSchema = z.number().min(0).max(1);
export const RunCoverageSchema = z.object({
  scenarioDomain: z.object({
    covered: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    ratio: CoverageRatioSchema,
    missing: z.array(z.object({
      scenarioId: ReferenceIdSchema,
      domain: SimulationDomainSchema,
    }).strict()),
  }).strict(),
  personaScenario: z.object({
    covered: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    ratio: CoverageRatioSchema,
    missing: z.array(z.object({
      personaId: ReferenceIdSchema,
      scenarioId: ReferenceIdSchema,
    }).strict()),
  }).strict(),
  analysisEvidence: z.object({
    referenced: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    ratio: CoverageRatioSchema,
    unusedRefs: z.array(ReferenceIdSchema),
  }).strict(),
  domains: z.array(z.object({
    domain: SimulationDomainSchema,
    scenarioIds: z.array(ReferenceIdSchema),
    roundCount: z.number().int().nonnegative(),
    evidenceRefs: z.array(ReferenceIdSchema),
    evidenceKinds: z.array(z.enum(["intel", "evaluation", "capture", "ui-reference"])),
    sourceTools: z.array(SourceToolSchema),
  }).strict()),
}).strict();

const RunSealSchema = z.object({
  algorithm: z.literal("sha256"),
  canonicalSha256: Sha256Schema,
}).strict();

export const RunRecordCoreSchema = z.object({
  schemaVersion: z.literal(8),
  runId: RunIdSchema,
  targetId: CanonicalTargetIdSchema,
  topic: z.string().min(1).max(120),
  subjectKind: SubjectKindSchema,
  market: ConsultationTextSchema,
  language: ConsultationTextSchema,
  projectBrief: ProjectBriefObjectSchema.optional(),
  mode: SimulationModeSchema,
  selectedDomains: z.array(SimulationDomainSchema).min(1).max(6),
  recipe: z.object({
    id: z.literal(RUN_RECIPE_ID),
    path: z.literal("skills/run-sim.md"),
    sha256: Sha256Schema,
  }).strict(),
  model: ModelInputSchema.extend({reportedByClient: z.literal(true)}).strict(),
  scenarios: z.array(ScenarioSchema).min(1).max(8),
  personas: z.array(ResolvedPersonaSchema).min(1).max(12),
  evidence: z.array(ResolvedEvidenceSchema).min(1).max(100),
  rounds: z.array(SimulationRoundSchema).min(1).max(100),
  warnings: z.array(z.string().max(2_000)).max(100),
  confidence: ConfidenceInputSchema.extend({reportedByClient: z.literal(true)}).strict(),
  simulationReadiness: SimulationReadinessSchema,
  finalEvaluationRef: ReferenceIdSchema,
  savedAt: IsoDateTimeSchema,
  coverage: RunCoverageSchema,
}).strict();

const RunRecordBaseSchema = RunRecordCoreSchema.extend({
  seal: RunSealSchema,
}).strict();

export const RunRecordSchema = RunRecordBaseSchema.superRefine((value, context) => {
  validateRelations({
    ...value,
    personaIds: value.personas.map((persona) => persona.id),
    evidenceRefs: value.evidence,
  }, context);
  validateDeveloperProjectBrief(value, context);
  const finalEvaluation = value.evidence.find(
    (item) => item.ref === value.finalEvaluationRef && item.kind === "evaluation",
  );
  if (
    (value.subjectKind === "developer-concept" || value.subjectKind === "developer-project")
    && finalEvaluation?.indieStrategyMode !== "detailed"
  ) {
    context.addIssue({
      code: "custom",
      path: ["finalEvaluationRef"],
      message: "developer runs require a detailed Indie Survival Strategy",
    });
  }
});

export const RunArtifactMetadataSchema = z.object({
  path: z.string().min(1),
  targetId: CanonicalTargetIdSchema,
  id: RunIdSchema,
  runId: RunIdSchema,
  topic: z.string().min(1).max(120),
  subjectKind: SubjectKindSchema,
  market: ConsultationTextSchema,
  language: ConsultationTextSchema,
  mode: SimulationModeSchema,
  selectedDomains: z.array(SimulationDomainSchema).min(1).max(6),
  savedAt: IsoDateTimeSchema,
  roundCount: z.number().int().positive(),
  evidenceCount: z.number().int().positive(),
  simulationReadinessStatus: SimulationReadinessSchema.shape.status,
  sizeBytes: z.number().int().positive().max(MAX_RUN_BYTES),
  sha256: Sha256Schema,
}).strict();

export const RunIntegrityDependencySchema = z.object({
  type: z.enum(["recipe", "persona", "evidence"]),
  ref: z.string().min(1),
  path: z.string().min(1),
  status: z.enum(["verified", "missing", "mismatch", "unreadable"]),
  expectedSha256: Sha256Schema,
  actualSha256: Sha256Schema.optional(),
  actualPath: z.string().min(1).optional(),
  message: z.string().min(1).max(2_000).optional(),
}).strict();

export const RunIntegrityReportSchema = z.object({
  status: z.enum(["verified", "failed"]),
  checkedAt: IsoDateTimeSchema,
  record: z.object({
    status: z.enum(["verified", "mismatch"]),
    expectedSha256: Sha256Schema,
    actualSha256: Sha256Schema,
  }).strict(),
  dependencies: z.array(RunIntegrityDependencySchema),
  verifiedCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
}).strict();

export type SaveRunInput = z.infer<typeof SaveRunInputSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type RunArtifactMetadata = z.infer<typeof RunArtifactMetadataSchema>;
export type RunIntegrityReport = z.infer<typeof RunIntegrityReportSchema>;
