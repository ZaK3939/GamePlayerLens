import {createHash, randomUUID} from "node:crypto";
import {constants, type Dirent, type Stats} from "node:fs";
import {
  link as nodeLink,
  mkdir as nodeMkdir,
  open as nodeOpen,
  readdir as nodeReaddir,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile,
  type FileHandle,
} from "node:fs/promises";
import {basename, dirname, relative, sep} from "node:path";
import {z} from "zod";
import {
  assertCanonicalEvaluationMarkdown,
  EVALUATION_DOMAINS,
  IntelRecordSchema,
  MAX_EVALUATION_BYTES,
  MAX_INTEL_PAYLOAD_BYTES,
  SourceToolSchema,
} from "./artifacts.js";
import {MAX_INLINE_IMAGE_BYTES} from "./images.js";
import {PersonaSchema} from "./personas.js";
import {
  ExperimentOutcomeSchema,
  ExperimentSpecSchema,
  matchesExperimentSpec,
  verifyExperimentOutcome,
  type VerifiedExperimentDecision,
  type VerifiedForecastComparison,
} from "./experiments.js";
import {
  buildProjectBriefDiagnostics,
  ProjectBriefObjectSchema,
  SubjectKindSchema,
} from "./prompts.js";
import type {
  PathResolver,
  ResolvedImagePath,
  ResolvedRunPath,
} from "./paths.js";

export const MAX_RUN_BYTES = 2 * 1024 * 1024;
const MAX_PERSONA_BYTES = 512 * 1024;
const MAX_RECIPE_BYTES = 512 * 1024;
const MAX_STORED_INTEL_BYTES = 4 * MAX_INTEL_PAYLOAD_BYTES;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RUN_RECIPE_ID = "run-sim.md";

export const RunIdSchema = z.uuid();
export const SimulationModeSchema = z.enum(["baseline", "change"]);
export const SimulationDomainSchema = z.enum(EVALUATION_DOMAINS);
const ReferenceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const CanonicalTargetIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoDateTimeSchema = z.iso.datetime({offset: true});
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

const EvidenceReferenceInputSchema = z.discriminatedUnion("kind", [
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
  output: z.string().min(1).max(100_000),
  evidenceRefs: z.array(ReferenceIdSchema).min(1).max(50),
}).strict();

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

const ResolvedPersonaSchema = z.object({
  id: ReferenceIdSchema,
  path: z.string().min(1),
  sha256: Sha256Schema,
}).strict();

const ResolvedEvidenceSchema = z.object({
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
const RunCoverageSchema = z.object({
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

const RunRecordCoreSchema = z.object({
  schemaVersion: z.literal(6),
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

const RunIntegrityDependencySchema = z.object({
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

interface ResolvedEvidenceResult {
  record: z.infer<typeof ResolvedEvidenceSchema>;
  payload?: unknown;
  evaluationDomains?: string[];
}

export interface RunArtifact {
  metadata: RunArtifactMetadata;
  record: RunRecord;
  integrity: RunIntegrityReport;
}

interface RunFileHandle {
  stat(): Promise<Stats>;
  readFile(): Promise<Buffer>;
  close(): Promise<void>;
}

export interface RunFileOps {
  mkdir(path: string, options: {recursive: true}): Promise<string | undefined>;
  writeFile(
    path: string,
    data: string,
    options: {encoding: "utf8"; flag: "wx"},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string, options: {withFileTypes: true}): Promise<Dirent[]>;
  open(path: string, flags: number): Promise<RunFileHandle>;
}

const nodeFileOps: RunFileOps = {
  mkdir: (path, options) => nodeMkdir(path, options),
  writeFile: (path, data, options) => nodeWriteFile(path, data, options),
  link: nodeLink,
  unlink: nodeUnlink,
  readdir: (path, options) => nodeReaddir(path, options),
  open: (path, flags) => nodeOpen(path, flags) as Promise<FileHandle>,
};

export interface RunStoreOptions {
  clock?: () => Date;
  idFactory?: () => string;
  fileOps?: Partial<RunFileOps>;
}

export interface RunStore {
  saveRun(input: SaveRunInput): Promise<RunArtifactMetadata>;
  listTargets(): Promise<string[]>;
  listRuns(target: string): Promise<RunArtifactMetadata[]>;
  readRun(target: string, id: string): Promise<RunArtifact>;
}

export class RunSchemaError extends Error {
  override name = "RunSchemaError";
}

function isNodeError(error: unknown, code: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === code) return true;
    current = current.cause;
  }
  return false;
}

function hash(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("run record is not JSON serializable");
    return serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function canonicalHash(value: unknown): string {
  return hash(canonicalJson(value));
}

function ratio(covered: number, total: number): number {
  return total === 0 ? 1 : covered / total;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingError(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (isNodeError(current, "ENOENT") || /does not exist/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

function relativeAssetPath(resolver: PathResolver, absolutePath: string): string {
  return relative(resolver.assetRoot, absolutePath).split(sep).join("/");
}

function evaluationId(id: string): {date: string; topic: string} {
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(id);
  if (!match?.[1] || !match[2]) throw new Error("invalid evaluation artifact id");
  return {date: match[1], topic: match[2]};
}

function buildCoverage(
  input: SaveRunInput,
  evidence: Array<z.infer<typeof ResolvedEvidenceSchema>>,
): z.infer<typeof RunCoverageSchema> {
  const scenarioDomainMissing: Array<{
    scenarioId: string;
    domain: z.infer<typeof SimulationDomainSchema>;
  }> = [];
  for (const scenario of input.scenarios) {
    for (const domain of input.selectedDomains) {
      if (!input.rounds.some((round) =>
        round.phase === "domain"
        && round.scenarioId === scenario.id
        && round.domain === domain)) {
        scenarioDomainMissing.push({scenarioId: scenario.id, domain});
      }
    }
  }

  const personaScenarioMissing: Array<{personaId: string; scenarioId: string}> = [];
  for (const personaId of input.personaIds) {
    for (const scenario of input.scenarios) {
      if (!input.rounds.some((round) =>
        round.phase === "persona"
        && round.personaId === personaId
        && round.scenarioId === scenario.id)) {
        personaScenarioMissing.push({personaId, scenarioId: scenario.id});
      }
    }
  }

  const usedEvidence = new Set(input.rounds.flatMap((round) => round.evidenceRefs));
  const analysisEvidence = evidence.filter((item) => item.ref !== input.finalEvaluationRef);
  const unusedRefs = analysisEvidence
    .filter((item) => !usedEvidence.has(item.ref))
    .map((item) => item.ref);

  const domains = input.selectedDomains.map((domain) => {
    const rounds = input.rounds.filter((round) =>
      round.phase === "domain" && round.domain === domain);
    const roundEvidence = new Set(rounds.flatMap((round) => round.evidenceRefs));
    const selectedEvidence = evidence.filter((item) => roundEvidence.has(item.ref));
    return {
      domain,
      scenarioIds: input.scenarios
        .filter((scenario) => rounds.some((round) => round.scenarioId === scenario.id))
        .map((scenario) => scenario.id),
      roundCount: rounds.length,
      evidenceRefs: selectedEvidence.map((item) => item.ref),
      evidenceKinds: [...new Set(selectedEvidence.map((item) => item.kind))],
      sourceTools: [...new Set(selectedEvidence.flatMap((item) =>
        item.sourceTool ? [item.sourceTool] : []))],
    };
  });

  const scenarioDomainTotal = input.scenarios.length * input.selectedDomains.length;
  const personaScenarioTotal = input.personaIds.length * input.scenarios.length;
  const referencedEvidence = analysisEvidence.length - unusedRefs.length;
  return RunCoverageSchema.parse({
    scenarioDomain: {
      covered: scenarioDomainTotal - scenarioDomainMissing.length,
      total: scenarioDomainTotal,
      ratio: ratio(scenarioDomainTotal - scenarioDomainMissing.length, scenarioDomainTotal),
      missing: scenarioDomainMissing,
    },
    personaScenario: {
      covered: personaScenarioTotal - personaScenarioMissing.length,
      total: personaScenarioTotal,
      ratio: ratio(personaScenarioTotal - personaScenarioMissing.length, personaScenarioTotal),
      missing: personaScenarioMissing,
    },
    analysisEvidence: {
      referenced: referencedEvidence,
      total: analysisEvidence.length,
      ratio: ratio(referencedEvidence, analysisEvidence.length),
      unusedRefs,
    },
    domains,
  });
}

function experimentArtifactType(
  payload: unknown,
): "experiment-spec" | "experiment-measurement" | "experiment-outcome" | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const artifactType = (payload as Record<string, unknown>).artifactType;
  return artifactType === "experiment-spec"
    || artifactType === "experiment-measurement"
    || artifactType === "experiment-outcome"
    ? artifactType
    : undefined;
}

interface OutcomeChainCheck {
  ref: string;
  status: "verified" | "unresolved" | "invalid";
  issues: string[];
  comparison?: VerifiedForecastComparison;
  decision?: VerifiedExperimentDecision;
}

async function buildSimulationReadiness(
  input: SaveRunInput,
  targetId: string,
  savedAt: string,
  evidence: ResolvedEvidenceResult[],
  verifyOutcome: (
    outcome: ResolvedEvidenceResult,
    currentSpec: ResolvedEvidenceResult | undefined,
  ) => Promise<OutcomeChainCheck>,
): Promise<z.infer<typeof SimulationReadinessSchema>> {
  const experimentSpecs = evidence.filter(
    ({record}) => record.artifactType === "experiment-spec",
  );
  const requiredSpecPhases = ["persona", "domain", "critic", "synthesis"] as const;
  const matchedExperimentSpecs = experimentSpecs.filter(({payload, record}) =>
    matchesExperimentSpec(payload, {
      targetId,
      mode: input.mode,
      scenarios: input.scenarios,
    })
    && Boolean(record.observedAt && Date.parse(record.observedAt) <= Date.parse(savedAt))
    && Boolean(record.savedAt && Date.parse(record.savedAt) <= Date.parse(savedAt))
    && requiredSpecPhases.every((phase) => input.rounds.some((round) =>
      round.phase === phase && round.evidenceRefs.includes(record.ref))));
  const experimentOutcomes = evidence.filter(
    ({record}) => record.artifactType === "experiment-outcome",
  );
  const currentSpec = matchedExperimentSpecs.length === 1
    ? matchedExperimentSpecs[0]
    : undefined;
  const outcomeChecks: OutcomeChainCheck[] = [];
  for (const outcome of experimentOutcomes) {
    outcomeChecks.push(await verifyOutcome(outcome, currentSpec));
  }
  const verifiedChecks = outcomeChecks.filter(({status}) => status === "verified");
  const serverVerified = verifiedChecks.length > 0;
  const experimentDecisions = outcomeChecks.flatMap(({ref, status: outcomeStatus, decision}) => {
    if (!decision) return [];
    const status = outcomeStatus === "verified"
      && decision.serverOverallVerdict !== "unresolved"
      ? "verified" as const
      : "unresolved" as const;
    return [{outcomeRef: ref, status, ...decision}];
  });
  const hasVerifiedDecision = experimentDecisions.some(({status}) => status === "verified");
  const validationStatus = experimentSpecs.length === 0
    ? "absent" as const
    : matchedExperimentSpecs.length === 0
      ? "invalid-plan" as const
      : matchedExperimentSpecs.length > 1
        ? "ambiguous-plan" as const
        : "planned" as const;
  const status = matchedExperimentSpecs.length === 1
    ? "validation-ready" as const
    : "rehearsal" as const;
  const reasons = [
    experimentSpecs.length === 0
      ? "No ExperimentSpec evidence is linked to this run."
      : matchedExperimentSpecs.length === 0
        ? "No linked ExperimentSpec matches this run's target, mode, scenarios, temporal order, primary prediction contract, and required analysis phases."
        : matchedExperimentSpecs.length > 1
          ? "Multiple matching ExperimentSpecs make the preregistered prediction ambiguous."
          : "One matching ExperimentSpec is linked and used across all required analysis phases.",
    "Population representativeness is not established.",
    serverVerified
      ? `${verifiedChecks.length} ExperimentOutcome forecast comparison(s) passed server-side hash-chain, timing, protocol, sample, and raw-measurement verification.`
      : experimentOutcomes.length > 0
        ? "ExperimentOutcome evidence is linked, but no calibration chain passed server verification."
      : "Held-out outcome calibration is not server-verified.",
  ];
  const allowedClaims = [
    "issue-hypothesis",
    "directional-response-hypothesis",
    "test-priority",
    ...(status === "validation-ready" ? ["preregistered-prediction"] as const : []),
    ...(serverVerified ? ["validated-forecast-error"] as const : []),
    ...(hasVerifiedDecision ? ["verified-experiment-decision"] as const : []),
  ];
  return SimulationReadinessSchema.parse({
    status,
    serverAssessed: true,
    populationRepresentativeness: "not-established",
    scenarioComparison: input.mode === "baseline" ? "single-scenario" : "paired-coverage",
    interventionIsolation: "not-verified",
    heldOutValidation: {
      status: validationStatus,
      experimentSpecRefs: experimentSpecs.map(({record}) => record.ref),
      matchedExperimentSpecRefs: matchedExperimentSpecs.map(({record}) => record.ref),
      experimentOutcomeRefs: experimentOutcomes.map(({record}) => record.ref),
      verifiedExperimentOutcomeRefs: verifiedChecks.map(({ref}) => ref),
    },
    calibration: {
      clientReportedStatus: input.confidence.calibrationStatus,
      serverVerified,
      outcomeChecks: outcomeChecks.map(({ref, status, issues}) => ({ref, status, issues})),
      forecastComparisons: verifiedChecks.flatMap(({ref, comparison}) => comparison
        ? [{outcomeRef: ref, ...comparison}]
        : []),
    },
    experimentDecisions,
    allowedClaims,
    blockedClaims: [
      "population-rate",
      "market-share",
      "causal-lift",
      "retention-impact",
    ],
    reasons,
  });
}

export function createRunStore(
  resolver: PathResolver,
  options: RunStoreOptions = {},
): RunStore {
  const ops = {...nodeFileOps, ...options.fileOps};
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? randomUUID;
  const probeId = "00000000-0000-4000-8000-000000000000";

  async function readRegularBytes(
    absolutePath: string,
    maxBytes: number,
  ): Promise<{bytes: Buffer; stats: Stats}> {
    let handle: RunFileHandle;
    try {
      handle = await ops.open(
        absolutePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if (isNodeError(error, "ELOOP")) {
        throw new Error("symlink run evidence is not allowed", {cause: error});
      }
      if (isNodeError(error, "ENOENT")) {
        throw new Error("run evidence does not exist", {cause: error});
      }
      throw new Error("run evidence could not be opened", {cause: error});
    }
    try {
      const stats = await handle.stat();
      if (stats.isSymbolicLink()) throw new Error("symlink run evidence is not allowed");
      if (!stats.isFile()) throw new Error("run evidence is not a regular file");
      if (stats.size < 1 || stats.size > maxBytes) {
        throw new Error("run evidence exceeds its allowed size");
      }
      const bytes = await handle.readFile();
      const finalStats = await handle.stat();
      if (
        bytes.length !== stats.size
        || finalStats.size !== stats.size
        || finalStats.dev !== stats.dev
        || finalStats.ino !== stats.ino
        || finalStats.mtimeMs !== stats.mtimeMs
        || finalStats.ctimeMs !== stats.ctimeMs
      ) {
        throw new Error("run evidence changed while reading");
      }
      return {bytes, stats};
    } finally {
      await handle.close();
    }
  }

  function verifyImageSignature(resolved: ResolvedImagePath, bytes: Buffer): void {
    const signature = resolved.relativePath.endsWith(".jpg")
      ? JPEG_SIGNATURE
      : PNG_SIGNATURE;
    if (!bytes.subarray(0, signature.length).equals(signature)) {
      throw new Error("run image evidence has an invalid signature");
    }
  }

  async function resolveCapture(id: string): Promise<{
    resolved: ResolvedImagePath;
    bytes: Buffer;
  }> {
    const found: Array<{resolved: ResolvedImagePath; bytes: Buffer}> = [];
    for (const extension of ["png", "jpg"] as const) {
      const resolved = resolver.resolveCaptureReadPath(id, extension);
      try {
        const {bytes} = await readRegularBytes(
          resolved.absolutePath,
          MAX_INLINE_IMAGE_BYTES,
        );
        verifyImageSignature(resolved, bytes);
        found.push({resolved, bytes});
      } catch (error) {
        if (!isNodeError(error, "ENOENT")) throw error;
      }
    }
    if (found.length > 1) throw new Error("ambiguous capture evidence id");
    if (found.length < 1) throw new Error("capture evidence does not exist");
    return found[0]!;
  }

  async function resolveEvidence(
    input: z.infer<typeof EvidenceReferenceInputSchema>,
  ): Promise<ResolvedEvidenceResult> {
    if (input.kind === "intel") {
      const resolved = resolver.resolveIntelArtifactPath(input.target, input.id);
      const {bytes} = await readRegularBytes(
        resolved.absolutePath,
        MAX_STORED_INTEL_BYTES,
      );
      const record = IntelRecordSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      if (
        record.targetId !== resolved.targetId
        || record.artifactId !== resolved.artifactId
      ) {
        throw new Error("intel evidence does not match its path");
      }
      const artifactType = experimentArtifactType(record.payload);
      return {
        record: ResolvedEvidenceSchema.parse({
          ref: input.ref,
          kind: input.kind,
          targetId: resolved.targetId,
          id: resolved.artifactId,
          path: resolved.relativePath,
          sha256: hash(bytes),
          sourceTool: record.sourceTool,
          observedAt: record.observedAt,
          savedAt: record.savedAt,
          ...(artifactType ? {artifactType} : {}),
        }),
        payload: record.payload,
      };
    }
    if (input.kind === "evaluation") {
      const parsed = evaluationId(input.id);
      const resolved = resolver.resolveEvaluationPath(input.target, parsed.date, parsed.topic);
      const {bytes} = await readRegularBytes(
        resolved.absolutePath,
        MAX_EVALUATION_BYTES,
      );
      const evaluation = assertCanonicalEvaluationMarkdown(bytes.toString("utf8"));
      return {record: ResolvedEvidenceSchema.parse({
        ref: input.ref,
        kind: input.kind,
        targetId: resolved.targetId,
        id: `${parsed.date}-${resolved.topicId}`,
        path: resolved.relativePath,
        sha256: hash(bytes),
        indieStrategyMode: evaluation.indieStrategyMode,
      }), evaluationDomains: evaluation.selectedDomains};
    }
    if (input.kind === "capture") {
      const {resolved, bytes} = await resolveCapture(input.id);
      return {record: ResolvedEvidenceSchema.parse({
        ref: input.ref,
        kind: input.kind,
        id: resolved.id,
        path: resolved.relativePath,
        sha256: hash(bytes),
      })};
    }
    const resolved = resolver.resolveUiReferencePath(input.id);
    const {bytes} = await readRegularBytes(
      resolved.absolutePath,
      MAX_INLINE_IMAGE_BYTES,
    );
    verifyImageSignature(resolved, bytes);
    return {record: ResolvedEvidenceSchema.parse({
      ref: input.ref,
      kind: input.kind,
      id: resolved.id,
      path: resolved.relativePath,
      sha256: hash(bytes),
    })};
  }

  async function resolvePersonas(ids: string[]): Promise<Array<z.infer<
    typeof ResolvedPersonaSchema
  >>> {
    const personas: Array<z.infer<typeof ResolvedPersonaSchema>> = [];
    for (const id of ids) {
      const path = resolver.resolvePersonaPath(id);
      const {bytes} = await readRegularBytes(path, MAX_PERSONA_BYTES);
      const parsed = PersonaSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      if (parsed.id !== id) throw new Error("persona evidence does not match its path");
      personas.push({
        id: parsed.id,
        path: relative(resolver.root, path).split(sep).join("/"),
        sha256: hash(bytes),
      });
    }
    return personas;
  }

  async function recipeRecord(): Promise<RunRecord["recipe"]> {
    const path = resolver.resolveSkillPath(RUN_RECIPE_ID);
    const {bytes} = await readRegularBytes(path, MAX_RECIPE_BYTES);
    const relativePath = relativeAssetPath(resolver, path);
    if (relativePath !== "skills/run-sim.md") {
      throw new Error("run recipe is outside the configured asset root");
    }
    return {id: RUN_RECIPE_ID, path: relativePath, sha256: hash(bytes)};
  }

  async function auditDependency(
    type: z.infer<typeof RunIntegrityDependencySchema>["type"],
    ref: string,
    expectedPath: string,
    expectedSha256: string,
    loadCurrent: () => Promise<{path: string; sha256: string}>,
  ): Promise<z.infer<typeof RunIntegrityDependencySchema>> {
    try {
      const current = await loadCurrent();
      const matches = current.path === expectedPath && current.sha256 === expectedSha256;
      return RunIntegrityDependencySchema.parse({
        type,
        ref,
        path: expectedPath,
        status: matches ? "verified" : "mismatch",
        expectedSha256,
        actualSha256: current.sha256,
        actualPath: current.path,
        ...(matches ? {} : {message: "stored path or SHA-256 no longer matches"}),
      });
    } catch (error) {
      return RunIntegrityDependencySchema.parse({
        type,
        ref,
        path: expectedPath,
        status: isMissingError(error) ? "missing" : "unreadable",
        expectedSha256,
        message: errorMessage(error).slice(0, 2_000),
      });
    }
  }

  async function auditRun(record: RunRecord): Promise<RunIntegrityReport> {
    const {seal, ...coreInput} = record;
    const core = RunRecordCoreSchema.parse(coreInput);
    const actualRecordSha256 = canonicalHash(core);
    const recordStatus = seal.canonicalSha256 === actualRecordSha256
      ? "verified" as const
      : "mismatch" as const;

    const dependencies: Array<z.infer<typeof RunIntegrityDependencySchema>> = [];
    dependencies.push(await auditDependency(
      "recipe",
      record.recipe.id,
      record.recipe.path,
      record.recipe.sha256,
      async () => {
        const current = await recipeRecord();
        return {path: current.path, sha256: current.sha256};
      },
    ));
    for (const persona of record.personas) {
      dependencies.push(await auditDependency(
        "persona",
        persona.id,
        persona.path,
        persona.sha256,
        async () => {
          const [current] = await resolvePersonas([persona.id]);
          if (!current) throw new Error("persona evidence does not exist");
          return {path: current.path, sha256: current.sha256};
        },
      ));
    }
    for (const evidence of record.evidence) {
      dependencies.push(await auditDependency(
        "evidence",
        evidence.ref,
        evidence.path,
        evidence.sha256,
        async () => {
          let input: z.infer<typeof EvidenceReferenceInputSchema>;
          if (evidence.kind === "intel" || evidence.kind === "evaluation") {
            if (!evidence.targetId) throw new Error("target-scoped evidence is missing targetId");
            input = {
              ref: evidence.ref,
              kind: evidence.kind,
              target: evidence.targetId,
              id: evidence.id,
            };
          } else {
            input = {ref: evidence.ref, kind: evidence.kind, id: evidence.id};
          }
          const current = await resolveEvidence(input);
          return {path: current.record.path, sha256: current.record.sha256};
        },
      ));
    }

    const dependencyIssues = dependencies.filter((item) => item.status !== "verified").length;
    const issueCount = dependencyIssues + (recordStatus === "verified" ? 0 : 1);
    const status = issueCount > 0 ? "failed" as const : "verified" as const;
    const checkedAt = IsoDateTimeSchema.parse(clock().toISOString());
    return RunIntegrityReportSchema.parse({
      status,
      checkedAt,
      record: {
        status: recordStatus,
        expectedSha256: seal.canonicalSha256,
        actualSha256: actualRecordSha256,
      },
      dependencies,
      verifiedCount: dependencies.length - dependencyIssues,
      issueCount,
    });
  }

  async function ensureDestination(target: string, runId: string): Promise<ResolvedRunPath> {
    const initial = resolver.resolveRunPath(target, runId);
    await ops.mkdir(dirname(initial.absolutePath), {recursive: true});
    const verified = resolver.resolveRunPath(target, runId);
    if (verified.absolutePath !== initial.absolutePath) {
      throw new Error("run destination changed during creation");
    }
    return verified;
  }

  async function atomicWrite(
    resolved: ResolvedRunPath,
    serialized: string,
  ): Promise<void> {
    const temporary = `${resolved.absolutePath}.${randomUUID()}.tmp`;
    let failed = false;
    try {
      await ops.writeFile(temporary, serialized, {encoding: "utf8", flag: "wx"});
      try {
        await ops.link(temporary, resolved.absolutePath);
      } catch (error) {
        if (isNodeError(error, "EEXIST")) {
          throw new Error(`simulation run already exists: ${resolved.runId}`);
        }
        throw error;
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try {
        await ops.unlink(temporary);
      } catch (error) {
        if (!isNodeError(error, "ENOENT") && !failed) throw error;
      }
    }
  }

  function metadata(
    record: RunRecord,
    resolved: ResolvedRunPath,
    bytes: Buffer,
  ): RunArtifactMetadata {
    return RunArtifactMetadataSchema.parse({
      path: resolved.relativePath,
      targetId: record.targetId,
      id: record.runId,
      runId: record.runId,
      topic: record.topic,
      subjectKind: record.subjectKind,
      market: record.market,
      language: record.language,
      mode: record.mode,
      selectedDomains: record.selectedDomains,
      savedAt: record.savedAt,
      roundCount: record.rounds.length,
      evidenceCount: record.evidence.length,
      simulationReadinessStatus: record.simulationReadiness.status,
      sizeBytes: bytes.length,
      sha256: hash(bytes),
    });
  }

  async function parseStoredRun(
    target: string,
    id: string,
  ): Promise<{metadata: RunArtifactMetadata; record: RunRecord}> {
    const resolved = resolver.resolveRunPath(target, RunIdSchema.parse(id));
    try {
      const {bytes} = await readRegularBytes(resolved.absolutePath, MAX_RUN_BYTES);
      const record = RunRecordSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      if (record.targetId !== resolved.targetId || record.runId !== resolved.runId) {
        throw new Error("run record does not match its path");
      }
      return {record, metadata: metadata(record, resolved, bytes)};
    } catch (error) {
      if (isNodeError(error, "ENOENT")) throw error;
      throw new RunSchemaError(`invalid run schema at ${resolved.relativePath}`, {
        cause: error,
      });
    }
  }

  async function verifyOutcomeChain(
    outcomeEvidence: ResolvedEvidenceResult,
    currentSpecEvidence: ResolvedEvidenceResult | undefined,
    currentEvidence: ResolvedEvidenceResult[],
    input: SaveRunInput,
    currentSavedAt: string,
  ): Promise<OutcomeChainCheck> {
    const ref = outcomeEvidence.record.ref;
    const outcomeResult = ExperimentOutcomeSchema.safeParse(outcomeEvidence.payload);
    const currentSpecResult = ExperimentSpecSchema.safeParse(currentSpecEvidence?.payload);
    if (!outcomeResult.success) {
      return {ref, status: "invalid", issues: ["ExperimentOutcome schema is invalid."]};
    }
    if (!currentSpecResult.success || !currentSpecEvidence) {
      return {
        ref,
        status: "invalid",
        issues: ["A single matching current ExperimentSpec is required for calibration."],
      };
    }
    const outcome = outcomeResult.data;
    const currentSpec = currentSpecResult.data;
    const chainIssues: string[] = [];
    const requiredPhases = ["persona", "domain", "critic", "synthesis"] as const;
    const usedAcrossRequiredPhases = (evidenceRef: string) => requiredPhases.every(
      (phase) => input.rounds.some((round) =>
        round.phase === phase && round.evidenceRefs.includes(evidenceRef)),
    );

    const parentOutcomeRef = currentSpec.parentOutcomeRef;
    if (
      !parentOutcomeRef
      || parentOutcomeRef.target !== outcomeEvidence.record.targetId
      || parentOutcomeRef.id !== outcomeEvidence.record.id
    ) {
      chainIssues.push("Current ExperimentSpec parentOutcomeRef does not select this Outcome.");
    }
    if (!usedAcrossRequiredPhases(ref)) {
      chainIssues.push("ExperimentOutcome is not used across all required analysis phases.");
    }
    if (
      !outcomeEvidence.record.observedAt
      || !currentSpecEvidence.record.observedAt
      || Date.parse(currentSpecEvidence.record.observedAt) < Date.parse(outcomeEvidence.record.observedAt)
    ) {
      chainIssues.push("Current ExperimentSpec must be observed at or after its parent Outcome.");
    }
    if (
      !outcomeEvidence.record.savedAt
      || !currentSpecEvidence.record.savedAt
      || Date.parse(currentSpecEvidence.record.savedAt) < Date.parse(outcomeEvidence.record.savedAt)
    ) {
      chainIssues.push("Current ExperimentSpec must be saved at or after its parent Outcome.");
    }
    if (
      (outcomeEvidence.record.observedAt
        && Date.parse(outcomeEvidence.record.observedAt) > Date.parse(currentSavedAt))
      || (currentSpecEvidence.record.observedAt
        && Date.parse(currentSpecEvidence.record.observedAt) > Date.parse(currentSavedAt))
    ) {
      chainIssues.push("Current calibration evidence postdates this run.");
    }
    if (
      !outcomeEvidence.record.savedAt
      || !currentSpecEvidence.record.savedAt
      || Date.parse(outcomeEvidence.record.savedAt) > Date.parse(currentSavedAt)
      || Date.parse(currentSpecEvidence.record.savedAt) > Date.parse(currentSavedAt)
    ) {
      chainIssues.push("Current calibration evidence was not saved at or before this run.");
    }

    let historicalSpecEvidence: ResolvedEvidenceResult | undefined;
    try {
      historicalSpecEvidence = await resolveEvidence({
        ref: "historical-spec",
        kind: "intel",
        target: outcome.specRef.target,
        id: outcome.specRef.id,
      });
    } catch {
      chainIssues.push("Referenced historical ExperimentSpec is unavailable.");
    }
    const historicalSpecResult = ExperimentSpecSchema.safeParse(
      historicalSpecEvidence?.payload,
    );
    if (!historicalSpecResult.success || !historicalSpecEvidence) {
      chainIssues.push("Referenced historical ExperimentSpec schema is invalid.");
    } else if (historicalSpecEvidence.record.sha256 !== outcome.specRef.sha256) {
      chainIssues.push("Historical ExperimentSpec SHA-256 does not match Outcome specRef.");
    }

    let predictionRun: {metadata: RunArtifactMetadata; record: RunRecord} | undefined;
    try {
      predictionRun = await parseStoredRun(
        outcome.predictionRunRef.target,
        outcome.predictionRunRef.runId,
      );
    } catch {
      chainIssues.push("Referenced Prediction Run is unavailable or invalid.");
    }
    if (predictionRun) {
      if (
        predictionRun.record.targetId !== outcome.targetId
        || predictionRun.metadata.sha256 !== outcome.predictionRunRef.runArtifactSha256
        || predictionRun.record.seal.canonicalSha256
          !== outcome.predictionRunRef.canonicalRecordSha256
      ) {
        chainIssues.push("Prediction Run target or SHA-256 chain does not match Outcome.");
      }
      const historicalSpecRecord = predictionRun.record.evidence.find((item) =>
        item.kind === "intel"
        && item.targetId === outcome.specRef.target
        && item.id === outcome.specRef.id
        && item.sha256 === outcome.specRef.sha256
        && item.artifactType === "experiment-spec");
      if (
        predictionRun.record.simulationReadiness.status !== "validation-ready"
        || !historicalSpecRecord
        || !predictionRun.record.simulationReadiness.heldOutValidation
          .matchedExperimentSpecRefs.includes(historicalSpecRecord.ref)
      ) {
        chainIssues.push("Prediction Run did not seal the referenced ExperimentSpec as its matched plan.");
      }
      try {
        const integrity = await auditRun(predictionRun.record);
        if (integrity.status !== "verified") {
          chainIssues.push("Prediction Run integrity is not verified.");
        }
      } catch {
        chainIssues.push("Prediction Run integrity could not be verified.");
      }
      if (
        !outcomeEvidence.record.observedAt
        || Date.parse(outcomeEvidence.record.observedAt) < Date.parse(predictionRun.record.savedAt)
      ) {
        chainIssues.push("ExperimentOutcome predates its Prediction Run.");
      }
      if (
        !outcomeEvidence.record.savedAt
        || Date.parse(outcomeEvidence.record.savedAt) < Date.parse(predictionRun.record.savedAt)
      ) {
        chainIssues.push("ExperimentOutcome was not saved at or after its Prediction Run.");
      }
      if (
        historicalSpecEvidence?.record.observedAt
        && Date.parse(historicalSpecEvidence.record.observedAt)
          > Date.parse(predictionRun.record.savedAt)
      ) {
        chainIssues.push("Historical ExperimentSpec was not observed at or before the Prediction Run.");
      }
      if (
        !historicalSpecEvidence?.record.savedAt
        || Date.parse(historicalSpecEvidence.record.savedAt)
          > Date.parse(predictionRun.record.savedAt)
      ) {
        chainIssues.push("Historical ExperimentSpec was not saved at or before the Prediction Run.");
      }
    }

    const measurementInputs: Array<{ref: string; payload: unknown}> = [];
    for (const measurementRef of outcome.measurementEvidence) {
      const resolved = currentEvidence.find(({record}) =>
        record.ref === measurementRef.ref
        && record.kind === "intel"
        && record.targetId === measurementRef.target
        && record.id === measurementRef.id);
      if (
        !resolved
        || resolved.record.artifactType !== "experiment-measurement"
        || resolved.record.sha256 !== measurementRef.sha256
      ) {
        chainIssues.push(`Measurement evidence ${measurementRef.ref} is not hash-linked in the current run.`);
        continue;
      }
      if (!usedAcrossRequiredPhases(measurementRef.ref)) {
        chainIssues.push(`Measurement evidence ${measurementRef.ref} is not used across all required analysis phases.`);
      }
      if (
        !resolved.record.observedAt
        || !outcomeEvidence.record.observedAt
        || (predictionRun
          && Date.parse(resolved.record.observedAt) < Date.parse(predictionRun.record.savedAt))
        || Date.parse(resolved.record.observedAt) > Date.parse(outcomeEvidence.record.observedAt)
        || !resolved.record.savedAt
        || !outcomeEvidence.record.savedAt
        || (predictionRun
          && Date.parse(resolved.record.savedAt) < Date.parse(predictionRun.record.savedAt))
        || Date.parse(resolved.record.savedAt) > Date.parse(outcomeEvidence.record.savedAt)
      ) {
        chainIssues.push(`Measurement evidence ${measurementRef.ref} violates Prediction Run → measurement → Outcome ordering.`);
      }
      measurementInputs.push({ref: measurementRef.ref, payload: resolved.payload});
    }

    if (historicalSpecResult.success) {
      const historicalMetric = historicalSpecResult.data.metrics.find(
        ({metricId}) => metricId === historicalSpecResult.data.primaryMetricId,
      );
      const currentMetric = currentSpec.metrics.find(
        ({metricId}) => metricId === currentSpec.primaryMetricId,
      );
      const keys = ["metricId", "source", "instrument", "unit", "aggregation", "cohort", "window"] as const;
      if (!historicalMetric || !currentMetric || keys.some(
        (key) => historicalMetric[key] !== currentMetric[key],
      )) {
        chainIssues.push("Current and historical primary measurement contracts do not match.");
      }
    }

    const forecast = historicalSpecResult.success
      ? verifyExperimentOutcome(
        historicalSpecResult.data,
        outcome,
        measurementInputs,
      )
      : {issues: ["Historical ExperimentSpec is unavailable for forecast comparison."]};
    if (chainIssues.length > 0) {
      return {ref, status: "invalid", issues: [...new Set([...chainIssues, ...forecast.issues])]};
    }
    if (!forecast.comparison) {
      return {
        ref,
        status: "unresolved",
        issues: forecast.issues,
        ...(forecast.decision ? {decision: forecast.decision} : {}),
      };
    }
    return {
      ref,
      status: "verified",
      issues: [],
      comparison: forecast.comparison,
      ...(forecast.decision ? {decision: forecast.decision} : {}),
    };
  }

  async function saveRun(input: SaveRunInput): Promise<RunArtifactMetadata> {
    const parsed = SaveRunInputSchema.parse(input);
    const runId = RunIdSchema.parse(idFactory());
    const current = clock();
    if (Number.isNaN(current.getTime())) throw new Error("run clock is invalid");
    const savedAt = IsoDateTimeSchema.parse(current.toISOString());
    const resolved = await ensureDestination(parsed.target, runId);
    const resolvedEvidence: ResolvedEvidenceResult[] = [];
    for (const reference of parsed.evidence) {
      resolvedEvidence.push(await resolveEvidence(reference));
    }
    const evidence = resolvedEvidence.map(({record}) => record);
    const finalEvaluationResult = resolvedEvidence.find(
      (item) => item.record.ref === parsed.finalEvaluationRef
        && item.record.kind === "evaluation",
    );
    const finalEvaluation = finalEvaluationResult?.record;
    if (
      (parsed.subjectKind === "developer-concept" || parsed.subjectKind === "developer-project")
      && finalEvaluation?.indieStrategyMode !== "detailed"
    ) {
      throw new Error(
        "developer runs require a detailed Indie Survival Strategy in the final evaluation",
      );
    }
    if (
      !finalEvaluationResult?.evaluationDomains
      || finalEvaluationResult.evaluationDomains.length !== parsed.selectedDomains.length
      || parsed.selectedDomains.some(
        (domain) => !finalEvaluationResult.evaluationDomains!.includes(domain),
      )
    ) {
      throw new Error(
        "run selectedDomains must exactly match the final evaluation Selected Domains",
      );
    }
    const core = RunRecordCoreSchema.parse({
      schemaVersion: 6,
      runId: resolved.runId,
      targetId: resolved.targetId,
      topic: parsed.topic,
      subjectKind: parsed.subjectKind,
      market: parsed.market,
      language: parsed.language,
      ...(parsed.projectBrief ? {projectBrief: parsed.projectBrief} : {}),
      mode: parsed.mode,
      selectedDomains: parsed.selectedDomains,
      recipe: await recipeRecord(),
      model: {...parsed.model, reportedByClient: true},
      scenarios: parsed.scenarios,
      personas: await resolvePersonas(parsed.personaIds),
      evidence,
      rounds: parsed.rounds,
      warnings: parsed.warnings,
      confidence: {...parsed.confidence, reportedByClient: true},
      simulationReadiness: await buildSimulationReadiness(
        parsed,
        resolved.targetId,
        savedAt,
        resolvedEvidence,
        (outcome, currentSpec) => verifyOutcomeChain(
          outcome,
          currentSpec,
          resolvedEvidence,
          parsed,
          savedAt,
        ),
      ),
      finalEvaluationRef: parsed.finalEvaluationRef,
      savedAt,
      coverage: buildCoverage(parsed, evidence),
    });
    const record = RunRecordSchema.parse({
      ...core,
      seal: {
        algorithm: "sha256",
        canonicalSha256: canonicalHash(core),
      },
    });
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    const bytes = Buffer.from(serialized, "utf8");
    if (bytes.length > MAX_RUN_BYTES) {
      throw new Error("simulation run exceeds 2 MiB");
    }
    await atomicWrite(resolved, serialized);
    return metadata(record, resolved, bytes);
  }

  function workspaceRoot(): string {
    return dirname(dirname(dirname(
      resolver.resolveRunPath("run-list-probe", probeId).absolutePath,
    )));
  }

  async function listRuns(target: string): Promise<RunArtifactMetadata[]> {
    const directory = dirname(resolver.resolveRunPath(target, probeId).absolutePath);
    let entries: Dirent[];
    try {
      entries = await ops.readdir(directory, {withFileTypes: true});
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return [];
      throw error;
    }
    const runs: RunArtifactMetadata[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || !entry.name.endsWith(".json")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink simulation runs are not allowed");
      if (!entry.isFile()) continue;
      const id = entry.name.slice(0, -5);
      if (!RunIdSchema.safeParse(id).success) continue;
      const resolved = resolver.resolveRunPath(target, id);
      if (basename(resolved.absolutePath) !== entry.name) continue;
      runs.push((await parseStoredRun(target, id)).metadata);
    }
    return runs.sort((left, right) =>
      right.savedAt.localeCompare(left.savedAt) || left.id.localeCompare(right.id));
  }

  async function listTargets(): Promise<string[]> {
    const entries = await ops.readdir(workspaceRoot(), {withFileTypes: true});
    const targets: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink run targets are not allowed");
      if (!entry.isDirectory()) continue;
      if (!CanonicalTargetIdSchema.safeParse(entry.name).success) continue;
      const probe = resolver.resolveRunPath(entry.name, probeId);
      if (probe.targetId === entry.name && (await listRuns(entry.name)).length > 0) {
        targets.push(entry.name);
      }
    }
    return targets.sort((left, right) => left.localeCompare(right));
  }

  async function readRun(target: string, id: string): Promise<RunArtifact> {
    const stored = await parseStoredRun(target, id);
    return {...stored, integrity: await auditRun(stored.record)};
  }

  return {
    saveRun,
    listTargets,
    listRuns,
    readRun,
  };
}
