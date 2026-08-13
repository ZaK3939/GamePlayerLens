import {describe, expect, it} from "vitest";
import {ExperimentSpecSchema, matchesExperimentSpec} from "./experiments.js";

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
