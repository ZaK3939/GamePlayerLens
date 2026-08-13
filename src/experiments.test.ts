import {describe, expect, it} from "vitest";
import {
  ExperimentMeasurementSchema,
  ExperimentOutcomeSchema,
  ExperimentSpecSchema,
  matchesExperimentSpec,
  verifyOutcomeForecast,
} from "./experiments.js";

const SHA = "a".repeat(64);
const RUN_ID = "11111111-1111-4111-8111-111111111111";

function spec(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    artifactType: "experiment-spec",
    experimentId: "tutorial-001",
    targetId: "project-nyx",
    hypothesis: "A clearer checkpoint reduces first-task friction",
    mode: "baseline",
    plannedScenarios: [{
      id: "current",
      label: "Current",
      specification: "Current tutorial build",
    }],
    primaryMetricId: "friction-count",
    metrics: [{
      metricId: "friction-count",
      role: "primary",
      source: "human-playtest",
      instrument: "moderated tutorial test v1",
      unit: "count/session",
      aggregation: "median",
      direction: "decrease",
      cohort: "new keyboard players",
      window: "first tutorial task",
      samplePlan: {unit: "participant", targetCount: 8, minimumCount: 6},
    }],
    successCriteria: [{
      criterionId: "friction-below-threshold",
      metricId: "friction-count",
      scenarioId: "current",
      comparator: "<=",
      value: 2,
    }],
    guardrails: [],
    predictions: [{
      metricId: "friction-count",
      scenarioId: "current",
      predictedValue: 2,
      confidence: "low",
      basis: "Bounded persona rehearsal",
    }],
    stoppingRule: {
      outcomeDeadline: "2026-09-12",
      maximumSessions: 12,
      onGuardrailBreach: "stop-and-review",
      onRepeatedSourceBias: "stop-and-change-source",
    },
    orderBiasPlan: "N/A for one baseline scenario",
    parentOutcomeRef: null,
    ...overrides,
  };
}

const context = {
  targetId: "project-nyx",
  mode: "baseline" as const,
  scenarios: [{
    id: "current",
    label: "Current",
    specification: "Current tutorial build",
  }],
};

describe("ExperimentSpecSchema", () => {
  it("accepts a bounded spec and matches the exact run context", () => {
    expect(ExperimentSpecSchema.safeParse(spec()).success).toBe(true);
    expect(matchesExperimentSpec(spec(), context)).toBe(true);
    expect(matchesExperimentSpec(spec(), {...context, targetId: "other"})).toBe(false);
    expect(matchesExperimentSpec(spec(), {
      ...context,
      scenarios: [{...context.scenarios[0]!, specification: "Changed build"}],
    })).toBe(false);
  });

  it("rejects ambiguous predictions and invalid primary or sample contracts", () => {
    const base = spec();
    expect(ExperimentSpecSchema.safeParse(spec({
      predictions: [{
        ...(base.predictions as Array<Record<string, unknown>>)[0],
        predictedDelta: -1,
      }],
    })).success).toBe(false);
    expect(ExperimentSpecSchema.safeParse(spec({
      metrics: [{
        ...(base.metrics as Array<Record<string, unknown>>)[0],
        role: "secondary",
      }],
    })).success).toBe(false);
    expect(ExperimentSpecSchema.safeParse(spec({
      metrics: [{
        ...(base.metrics as Array<Record<string, unknown>>)[0],
        samplePlan: {unit: "participant", targetCount: 5, minimumCount: 6},
      }],
    })).success).toBe(false);
    expect(ExperimentSpecSchema.safeParse(spec({
      stoppingRule: {
        ...(base.stoppingRule as Record<string, unknown>),
        outcomeDeadline: "2026-99-99",
      },
    })).success).toBe(false);
  });
});

function measurement(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    artifactType: "experiment-measurement",
    measurementId: "tutorial-001-primary",
    experimentId: "tutorial-001",
    targetId: "project-nyx",
    metricId: "friction-count",
    source: "human-playtest",
    instrument: "moderated tutorial test v1",
    unit: "count/session",
    aggregation: "median",
    cohort: "new keyboard players",
    window: "first tutorial task",
    scenarioResults: [{scenarioId: "current", value: 1, sampleSize: 8}],
    protocolDeviations: [],
    ...overrides,
  };
}

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    artifactType: "experiment-outcome",
    experimentId: "tutorial-001",
    targetId: "project-nyx",
    specRef: {target: "project-nyx", id: "tutorial-001-spec", sha256: SHA},
    predictionRunRef: {
      target: "project-nyx",
      runId: RUN_ID,
      runArtifactSha256: SHA,
      canonicalRecordSha256: SHA,
    },
    measurementEvidence: [{
      ref: "human-sessions",
      target: "project-nyx",
      id: "tutorial-001-primary-measurement",
      sha256: SHA,
      metricId: "friction-count",
      source: "human-playtest",
    }],
    results: [{
      metricId: "friction-count",
      scenarioId: "current",
      status: "observed",
      source: "human-playtest",
      instrument: "moderated tutorial test v1",
      unit: "count/session",
      aggregation: "median",
      cohort: "new keyboard players",
      window: "first tutorial task",
      value: 1,
      sampleSize: 8,
      evidenceRefs: ["human-sessions"],
    }],
    criterionVerdicts: [{criterionId: "friction-below-threshold", verdict: "met"}],
    guardrailVerdicts: [],
    overallVerdict: "success",
    deviations: [],
    learnings: [{
      claim: "Observed friction was lower than predicted",
      basis: "human-sessions",
      nextAction: "Repeat on another input method",
    }],
    ...overrides,
  };
}

describe("ExperimentOutcome verification", () => {
  it("recomputes forecast error from a strict raw measurement envelope", () => {
    expect(ExperimentMeasurementSchema.safeParse(measurement()).success).toBe(true);
    expect(ExperimentOutcomeSchema.safeParse(outcome()).success).toBe(true);

    expect(verifyOutcomeForecast(spec(), outcome(), [{
      ref: "human-sessions",
      payload: measurement(),
    }])).toEqual({
      issues: [],
      comparison: expect.objectContaining({
        experimentId: "tutorial-001",
        metricId: "friction-count",
        kind: "value",
        predicted: 2,
        observed: 1,
        signedError: -1,
        absoluteError: 1,
        sampleSize: 8,
        aggregation: "median",
      }),
    });
  });

  it("does not verify missing, under-sampled, or measurement-divergent results", () => {
    const missing = outcome({
      measurementEvidence: [],
      results: [{
        ...outcome().results[0],
        status: "missing",
        value: undefined,
        sampleSize: 0,
        evidenceRefs: [],
      }],
      overallVerdict: "unresolved",
    });
    expect(verifyOutcomeForecast(spec(), missing, []).comparison).toBeUndefined();

    const underSampled = outcome({
      results: [{...outcome().results[0], sampleSize: 5}],
    });
    expect(verifyOutcomeForecast(spec(), underSampled, [{
      ref: "human-sessions",
      payload: measurement({
        scenarioResults: [{scenarioId: "current", value: 1, sampleSize: 5}],
      }),
    }]).issues).toContain(
      "Primary result friction-count/current is below minimum sample size.",
    );

    expect(verifyOutcomeForecast(spec(), outcome(), [{
      ref: "human-sessions",
      payload: measurement({
        scenarioResults: [{scenarioId: "current", value: 3, sampleSize: 8}],
      }),
    }]).issues).toContain(
      "Primary result friction-count/current is not reproduced by raw measurement evidence.",
    );
  });

  it("rejects malformed outcome value states and duplicate measurement scenarios", () => {
    expect(ExperimentOutcomeSchema.safeParse(outcome({
      results: [{...outcome().results[0], status: "missing"}],
    })).success).toBe(false);
    expect(ExperimentMeasurementSchema.safeParse(measurement({
      scenarioResults: [
        {scenarioId: "current", value: 1, sampleSize: 8},
        {scenarioId: "current", value: 2, sampleSize: 8},
      ],
    })).success).toBe(false);
  });
});
