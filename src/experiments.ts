import {z} from "zod";

const ReferenceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const CanonicalTargetIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u);
const SimulationModeSchema = z.enum(["baseline", "change"]);
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
