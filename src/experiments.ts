import {z} from "zod";

const ReferenceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const CanonicalTargetIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u);
const SimulationModeSchema = z.enum(["baseline", "change"]);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const RunIdSchema = z.uuid();
const ScenarioSchema = z.object({
  id: ReferenceIdSchema,
  label: z.string().trim().min(1).max(120),
  specification: z.string().min(1).max(50_000),
}).strict();

const MetricSourceSchema = z.enum([
  "ai-playtest",
  "human-playtest",
  "telemetry",
  "steam-reviews",
  "store-metric",
  "manual-observation",
]);

const MeasurementConditionSchema = z.object({
  source: MetricSourceSchema,
  instrument: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(120),
  aggregation: z.string().trim().min(1).max(120),
  cohort: z.string().trim().min(1).max(1_000),
  window: z.string().trim().min(1).max(500),
}).strict();

const ExperimentMetricSchema = z.object({
  metricId: ReferenceIdSchema,
  role: z.enum(["primary", "secondary", "guardrail", "exploratory"]),
  source: MetricSourceSchema,
  instrument: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(120),
  aggregation: z.string().trim().min(1).max(120),
  direction: z.enum(["increase", "decrease", "maintain"]),
  cohort: z.string().trim().min(1).max(1_000),
  window: z.string().trim().min(1).max(500),
  samplePlan: z.object({
    unit: z.string().trim().min(1).max(120),
    targetCount: z.number().int().positive().max(1_000_000),
    minimumCount: z.number().int().positive().max(1_000_000),
  }).strict(),
}).strict();

const CriterionSchema = z.object({
  criterionId: ReferenceIdSchema,
  metricId: ReferenceIdSchema,
  scenarioId: ReferenceIdSchema,
  referenceScenarioId: ReferenceIdSchema.optional(),
  comparator: z.enum(["<", "<=", "=", ">=", ">"]),
  value: z.number().finite(),
}).strict();

const PredictionSchema = z.object({
  metricId: ReferenceIdSchema,
  scenarioId: ReferenceIdSchema,
  referenceScenarioId: ReferenceIdSchema.optional(),
  predictedValue: z.number().finite().optional(),
  predictedDelta: z.number().finite().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  basis: z.string().trim().min(1).max(4_000),
}).strict().refine(
  (value) => (value.predictedValue === undefined) !== (value.predictedDelta === undefined),
  "prediction requires exactly one of predictedValue or predictedDelta",
);

export const ExperimentSpecSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal("experiment-spec"),
  experimentId: ReferenceIdSchema,
  targetId: CanonicalTargetIdSchema,
  hypothesis: z.string().trim().min(1).max(4_000),
  mode: SimulationModeSchema,
  plannedScenarios: z.array(ScenarioSchema).min(1).max(8),
  primaryMetricId: ReferenceIdSchema,
  metrics: z.array(ExperimentMetricSchema).min(1).max(50),
  successCriteria: z.array(CriterionSchema).min(1).max(50),
  guardrails: z.array(CriterionSchema).max(50),
  predictions: z.array(PredictionSchema).min(1).max(50),
  stoppingRule: z.object({
    outcomeDeadline: z.iso.date(),
    maximumSessions: z.number().int().positive().max(1_000_000),
    onGuardrailBreach: z.string().trim().min(1).max(500),
    onRepeatedSourceBias: z.string().trim().min(1).max(500),
  }).strict(),
  orderBiasPlan: z.string().trim().min(1).max(2_000),
  parentOutcomeRef: z.union([
    z.null(),
    z.object({
      target: CanonicalTargetIdSchema,
      id: CanonicalTargetIdSchema,
    }).strict(),
  ]),
}).strict().superRefine((value, context) => {
  const issue = (path: Array<string | number>, message: string) => {
    context.addIssue({code: "custom", path, message});
  };
  const unique = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) issue([path], `${path} ids must be unique`);
  };
  unique(value.plannedScenarios.map(({id}) => id), "plannedScenarios");
  unique(value.metrics.map(({metricId}) => metricId), "metrics");
  unique(value.successCriteria.map(({criterionId}) => criterionId), "successCriteria");
  unique(value.guardrails.map(({criterionId}) => criterionId), "guardrails");
  if (new Set([
    ...value.successCriteria.map(({criterionId}) => criterionId),
    ...value.guardrails.map(({criterionId}) => criterionId),
  ]).size !== value.successCriteria.length + value.guardrails.length) {
    issue(["guardrails"], "criterion ids must be unique across successCriteria and guardrails");
  }

  if (value.mode === "baseline" && value.plannedScenarios.length !== 1) {
    issue(["plannedScenarios"], "baseline experiment requires exactly one scenario");
  }
  if (value.mode === "change" && value.plannedScenarios.length < 2) {
    issue(["plannedScenarios"], "change experiment requires at least two scenarios");
  }
  const primaryMetrics = value.metrics.filter(({role}) => role === "primary");
  if (primaryMetrics.length !== 1 || primaryMetrics[0]?.metricId !== value.primaryMetricId) {
    issue(["primaryMetricId"], "primaryMetricId must identify the only primary metric");
  }
  if (!value.successCriteria.some(({metricId}) => metricId === value.primaryMetricId)) {
    issue(["successCriteria"], "successCriteria must include the primary metric");
  }
  if (!value.predictions.some(({metricId}) => metricId === value.primaryMetricId)) {
    issue(["predictions"], "predictions must include the primary metric");
  }

  const metricIds = new Set(value.metrics.map(({metricId}) => metricId));
  const scenarioIds = new Set(value.plannedScenarios.map(({id}) => id));
  for (const [collection, entries] of [
    ["successCriteria", value.successCriteria],
    ["guardrails", value.guardrails],
    ["predictions", value.predictions],
  ] as const) {
    entries.forEach((entry, index) => {
      if (!metricIds.has(entry.metricId)) {
        issue([collection, index, "metricId"], "unknown experiment metric");
      }
      if (!scenarioIds.has(entry.scenarioId)) {
        issue([collection, index, "scenarioId"], "unknown experiment scenario");
      }
      if (entry.referenceScenarioId && !scenarioIds.has(entry.referenceScenarioId)) {
        issue([collection, index, "referenceScenarioId"], "unknown reference scenario");
      }
      if (entry.referenceScenarioId === entry.scenarioId) {
        issue([collection, index, "referenceScenarioId"], "reference scenario must differ");
      }
    });
  }
  value.metrics.forEach((metric, index) => {
    if (metric.samplePlan.minimumCount > metric.samplePlan.targetCount) {
      issue(["metrics", index, "samplePlan"], "minimumCount cannot exceed targetCount");
    }
  });
});

export type ExperimentSpec = z.infer<typeof ExperimentSpecSchema>;

const ScenarioMeasurementSchema = z.object({
  scenarioId: ReferenceIdSchema,
  value: z.number().finite(),
  sampleSize: z.number().int().nonnegative().max(1_000_000),
}).strict();

export const ExperimentMeasurementSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal("experiment-measurement"),
  measurementId: ReferenceIdSchema,
  experimentId: ReferenceIdSchema,
  targetId: CanonicalTargetIdSchema,
  metricId: ReferenceIdSchema,
  ...MeasurementConditionSchema.shape,
  scenarioResults: z.array(ScenarioMeasurementSchema).min(1).max(8),
  protocolDeviations: z.array(z.string().trim().min(1).max(2_000)).max(50),
}).strict().superRefine((value, context) => {
  if (new Set(value.scenarioResults.map(({scenarioId}) => scenarioId)).size
    !== value.scenarioResults.length) {
    context.addIssue({
      code: "custom",
      path: ["scenarioResults"],
      message: "measurement scenario ids must be unique",
    });
  }
});

const OutcomeMeasurementReferenceSchema = z.object({
  ref: ReferenceIdSchema,
  target: CanonicalTargetIdSchema,
  id: CanonicalTargetIdSchema,
  sha256: Sha256Schema,
  metricId: ReferenceIdSchema,
  source: MetricSourceSchema,
}).strict();

const ExperimentResultSchema = z.object({
  metricId: ReferenceIdSchema,
  scenarioId: ReferenceIdSchema,
  status: z.enum(["observed", "reported-zero", "estimated", "missing"]),
  ...MeasurementConditionSchema.shape,
  value: z.number().finite().optional(),
  sampleSize: z.number().int().nonnegative().max(1_000_000),
  evidenceRefs: z.array(ReferenceIdSchema).max(50),
}).strict();

const CriterionVerdictSchema = z.object({
  criterionId: ReferenceIdSchema,
  verdict: z.enum(["met", "not-met", "breached", "unresolved"]),
}).strict();

export const ExperimentOutcomeSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal("experiment-outcome"),
  experimentId: ReferenceIdSchema,
  targetId: CanonicalTargetIdSchema,
  specRef: z.object({
    target: CanonicalTargetIdSchema,
    id: CanonicalTargetIdSchema,
    sha256: Sha256Schema,
  }).strict(),
  predictionRunRef: z.object({
    target: CanonicalTargetIdSchema,
    runId: RunIdSchema,
    runArtifactSha256: Sha256Schema,
    canonicalRecordSha256: Sha256Schema,
  }).strict(),
  measurementEvidence: z.array(OutcomeMeasurementReferenceSchema).max(50),
  results: z.array(ExperimentResultSchema).min(1).max(100),
  criterionVerdicts: z.array(CriterionVerdictSchema).max(50),
  guardrailVerdicts: z.array(CriterionVerdictSchema).max(50),
  overallVerdict: z.enum(["success", "failure", "mixed", "stopped", "unresolved"]),
  deviations: z.array(z.object({
    field: z.string().trim().min(1).max(120),
    planned: z.string().max(2_000),
    actual: z.string().max(2_000),
    reason: z.string().trim().min(1).max(2_000),
  }).strict()).max(50),
  learnings: z.array(z.object({
    claim: z.string().trim().min(1).max(4_000),
    basis: z.string().trim().min(1).max(4_000),
    nextAction: z.string().trim().min(1).max(4_000),
  }).strict()).max(50),
}).strict().superRefine((value, context) => {
  const issue = (path: Array<string | number>, message: string) => {
    context.addIssue({code: "custom", path, message});
  };
  const measurementRefs = value.measurementEvidence.map(({ref}) => ref);
  if (new Set(measurementRefs).size !== measurementRefs.length) {
    issue(["measurementEvidence"], "measurement evidence refs must be unique");
  }
  const resultKeys = value.results.map(({metricId, scenarioId}) => `${metricId}/${scenarioId}`);
  if (new Set(resultKeys).size !== resultKeys.length) {
    issue(["results"], "metric/scenario results must be unique");
  }
  for (const [index, result] of value.results.entries()) {
    const hasValue = result.value !== undefined;
    if (result.status === "missing" ? hasValue : !hasValue) {
      issue(["results", index, "value"], result.status === "missing"
        ? "missing results cannot have a value"
        : "non-missing results require a value");
    }
    if (result.status === "reported-zero" && result.value !== 0) {
      issue(["results", index, "value"], "reported-zero results require value 0");
    }
    if ((result.status === "observed" || result.status === "reported-zero")
      && result.evidenceRefs.length === 0) {
      issue(["results", index, "evidenceRefs"], "observed results require measurement evidence");
    }
    for (const ref of result.evidenceRefs) {
      if (!measurementRefs.includes(ref)) {
        issue(["results", index, "evidenceRefs"], `unknown measurement evidence: ${ref}`);
      }
    }
  }
});

export type ExperimentMeasurement = z.infer<typeof ExperimentMeasurementSchema>;
export type ExperimentOutcome = z.infer<typeof ExperimentOutcomeSchema>;

export interface OutcomeMeasurementInput {
  ref: string;
  payload: unknown;
}

export interface VerifiedForecastComparison {
  experimentId: string;
  metricId: string;
  kind: "value" | "delta";
  scenarioId: string;
  referenceScenarioId?: string;
  predicted: number;
  observed: number;
  signedError: number;
  absoluteError: number;
  sampleSize: number;
  referenceSampleSize?: number;
  source: z.infer<typeof MetricSourceSchema>;
  instrument: string;
  unit: string;
  aggregation: string;
  cohort: string;
  window: string;
}

export interface OutcomeVerificationResult {
  comparison?: VerifiedForecastComparison;
  issues: string[];
}

function sameConditions(
  left: z.infer<typeof MeasurementConditionSchema>,
  right: z.infer<typeof MeasurementConditionSchema>,
): boolean {
  return left.source === right.source
    && left.instrument === right.instrument
    && left.unit === right.unit
    && left.aggregation === right.aggregation
    && left.cohort === right.cohort
    && left.window === right.window;
}

export function verifyOutcomeForecast(
  specInput: unknown,
  outcomeInput: unknown,
  measurementInputs: OutcomeMeasurementInput[],
): OutcomeVerificationResult {
  const specResult = ExperimentSpecSchema.safeParse(specInput);
  const outcomeResult = ExperimentOutcomeSchema.safeParse(outcomeInput);
  if (!specResult.success) return {issues: ["Referenced ExperimentSpec schema is invalid."]};
  if (!outcomeResult.success) return {issues: ["ExperimentOutcome schema is invalid."]};
  const spec = specResult.data;
  const outcome = outcomeResult.data;
  const issues: string[] = [];
  if (outcome.experimentId !== spec.experimentId || outcome.targetId !== spec.targetId) {
    issues.push("Outcome experiment or target does not match its ExperimentSpec.");
  }

  const measurements = new Map<string, ExperimentMeasurement>();
  for (const input of measurementInputs) {
    const parsed = ExperimentMeasurementSchema.safeParse(input.payload);
    if (!parsed.success) {
      issues.push(`Measurement evidence ${input.ref} has an invalid schema.`);
      continue;
    }
    measurements.set(input.ref, parsed.data);
  }
  for (const reference of outcome.measurementEvidence) {
    const measurement = measurements.get(reference.ref);
    if (!measurement) {
      issues.push(`Measurement evidence ${reference.ref} is unavailable.`);
      continue;
    }
    if (
      measurement.targetId !== reference.target
      || measurement.metricId !== reference.metricId
      || measurement.source !== reference.source
      || measurement.experimentId !== outcome.experimentId
    ) {
      issues.push(`Measurement evidence ${reference.ref} does not match its Outcome reference.`);
    }
  }

  const primaryMetric = spec.metrics.find(({metricId}) => metricId === spec.primaryMetricId);
  const primaryPredictions = spec.predictions.filter(
    ({metricId}) => metricId === spec.primaryMetricId,
  );
  if (!primaryMetric || primaryPredictions.length !== 1) {
    issues.push("ExperimentSpec must have exactly one primary prediction for verification.");
    return {issues};
  }
  const prediction = primaryPredictions[0]!;
  const requiredScenarioIds = [
    prediction.scenarioId,
    ...(prediction.referenceScenarioId ? [prediction.referenceScenarioId] : []),
  ];
  const observed = new Map<string, z.infer<typeof ExperimentResultSchema>>();
  for (const scenarioId of requiredScenarioIds) {
    const result = outcome.results.find(({metricId, scenarioId: resultScenarioId}) =>
      metricId === primaryMetric.metricId && resultScenarioId === scenarioId);
    if (!result || (result.status !== "observed" && result.status !== "reported-zero")) {
      issues.push(`Primary result ${primaryMetric.metricId}/${scenarioId} is not observed.`);
      continue;
    }
    if (!sameConditions(primaryMetric, result)) {
      issues.push(`Primary result ${primaryMetric.metricId}/${scenarioId} changed measurement conditions.`);
    }
    if (result.sampleSize < primaryMetric.samplePlan.minimumCount) {
      issues.push(`Primary result ${primaryMetric.metricId}/${scenarioId} is below minimum sample size.`);
    }
    const backed = result.evidenceRefs.some((ref) => {
      const measurement = measurements.get(ref);
      const reference = outcome.measurementEvidence.find((item) => item.ref === ref);
      const measured = measurement?.scenarioResults.find((item) => item.scenarioId === scenarioId);
      return Boolean(
        measurement
        && reference
        && measurement.metricId === result.metricId
        && sameConditions(measurement, result)
        && measured
        && measured.value === result.value
        && measured.sampleSize === result.sampleSize,
      );
    });
    if (!backed) {
      issues.push(`Primary result ${primaryMetric.metricId}/${scenarioId} is not reproduced by raw measurement evidence.`);
    }
    observed.set(scenarioId, result);
  }
  if (issues.length > 0) return {issues};

  const candidate = observed.get(prediction.scenarioId)!;
  const reference = prediction.referenceScenarioId
    ? observed.get(prediction.referenceScenarioId)
    : undefined;
  const predicted = prediction.predictedValue ?? prediction.predictedDelta!;
  const actual = prediction.predictedValue !== undefined
    ? candidate.value!
    : candidate.value! - reference!.value!;
  const signedError = actual - predicted;
  return {
    issues: [],
    comparison: {
      experimentId: spec.experimentId,
      metricId: primaryMetric.metricId,
      kind: prediction.predictedValue !== undefined ? "value" : "delta",
      scenarioId: prediction.scenarioId,
      ...(prediction.referenceScenarioId
        ? {referenceScenarioId: prediction.referenceScenarioId}
        : {}),
      predicted,
      observed: actual,
      signedError,
      absoluteError: Math.abs(signedError),
      sampleSize: candidate.sampleSize,
      ...(reference ? {referenceSampleSize: reference.sampleSize} : {}),
      source: primaryMetric.source,
      instrument: primaryMetric.instrument,
      unit: primaryMetric.unit,
      aggregation: primaryMetric.aggregation,
      cohort: primaryMetric.cohort,
      window: primaryMetric.window,
    },
  };
}

export interface ExperimentSpecContext {
  targetId: string;
  mode: "baseline" | "change";
  scenarios: Array<{id: string; label: string; specification: string}>;
}

export function matchesExperimentSpec(
  payload: unknown,
  context: ExperimentSpecContext,
): boolean {
  const parsed = ExperimentSpecSchema.safeParse(payload);
  if (!parsed.success) return false;
  if (parsed.data.targetId !== context.targetId || parsed.data.mode !== context.mode) {
    return false;
  }
  return parsed.data.plannedScenarios.length === context.scenarios.length
    && parsed.data.plannedScenarios.every((scenario, index) => {
      const expected = context.scenarios[index];
      return expected !== undefined
        && scenario.id === expected.id
        && scenario.label === expected.label
        && scenario.specification === expected.specification;
    });
}
