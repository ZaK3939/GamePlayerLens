import {z} from "zod";
import {SourceToolSchema} from "./artifacts.js";
import {EVALUATION_DOMAINS} from "./evaluation-coverage.js";
import {
  ProjectBriefObjectSchema,
  SubjectKindSchema,
} from "./project-brief.js";
import {
  validateDeveloperProjectBrief,
  validateRunCompleteness,
  validateRunRelations,
  validateSaveRevisionBundleReference,
  validateStoredDeveloperEvaluation,
  validateStoredRevisionBundleReference,
} from "./run-validation.js";

export const MAX_RUN_BYTES = 2 * 1024 * 1024;
export const RUN_RECIPE_ID = "game-review.md";

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

const RunAudienceShape = {
  subjectKind: SubjectKindSchema,
  market: ConsultationTextSchema,
  language: ConsultationTextSchema,
  projectBrief: ProjectBriefObjectSchema.optional(),
  mode: SimulationModeSchema,
  selectedDomains: z.array(SimulationDomainSchema).min(1).max(6),
};
const ScenariosSchema = z.array(ScenarioSchema).min(1).max(8);
const RevisionBundleRefSchema = ReferenceIdSchema.optional();
const SimulationRoundsSchema = z.array(SimulationRoundSchema).min(1).max(100);
const RunWarningsSchema = z.array(z.string().max(2_000)).max(100);

export const SaveRunInputBaseSchema = z.object({
  target: z.string().min(1),
  topic: z.string().trim().min(1).max(120),
  ...RunAudienceShape,
  model: ModelInputSchema,
  scenarios: ScenariosSchema,
  personaIds: z.array(ReferenceIdSchema).min(1).max(12),
  evidence: z.array(EvidenceReferenceInputSchema).min(1).max(100),
  revisionBundleRef: RevisionBundleRefSchema,
  rounds: SimulationRoundsSchema,
  warnings: RunWarningsSchema,
  confidence: ConfidenceInputSchema,
  finalEvaluationRef: ReferenceIdSchema,
}).strict();

export const SaveRunInputSchema = SaveRunInputBaseSchema.superRefine((value, context) => {
  const relations = {
    ...value,
    personaIds: value.personaIds,
    evidenceRefs: value.evidence,
  };
  validateRunRelations(relations, context);
  validateRunCompleteness(relations, context);
  validateDeveloperProjectBrief(value, context);
  validateSaveRevisionBundleReference({
    ...value,
    evidenceRefs: value.evidence,
  }, context);
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
  schemaVersion: z.literal(9),
  runId: RunIdSchema,
  targetId: CanonicalTargetIdSchema,
  topic: z.string().min(1).max(120),
  ...RunAudienceShape,
  recipe: z.object({
    id: z.literal(RUN_RECIPE_ID),
    path: z.literal("skills/game-review.md"),
    sha256: Sha256Schema,
  }).strict(),
  model: ModelInputSchema.extend({reportedByClient: z.literal(true)}).strict(),
  scenarios: ScenariosSchema,
  personas: z.array(ResolvedPersonaSchema).min(1).max(12),
  evidence: z.array(ResolvedEvidenceSchema).min(1).max(100),
  revisionBundleRef: RevisionBundleRefSchema,
  rounds: SimulationRoundsSchema,
  warnings: RunWarningsSchema,
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
  const relations = {
    ...value,
    personaIds: value.personas.map((persona) => persona.id),
    evidenceRefs: value.evidence,
  };
  validateRunRelations(relations, context);
  validateDeveloperProjectBrief(value, context);
  validateStoredDeveloperEvaluation({
    ...value,
    evidenceRefs: value.evidence,
  }, context);
  validateStoredRevisionBundleReference({
    ...value,
    evidenceRefs: value.evidence,
  }, context);
});

export const RunArtifactMetadataSchema = z.object({
  path: z.string().min(1),
  targetId: CanonicalTargetIdSchema,
  id: RunIdSchema,
  runId: RunIdSchema,
  topic: z.string().min(1).max(120),
  subjectKind: RunAudienceShape.subjectKind,
  market: RunAudienceShape.market,
  language: RunAudienceShape.language,
  mode: RunAudienceShape.mode,
  selectedDomains: RunAudienceShape.selectedDomains,
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
