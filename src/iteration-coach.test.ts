import {describe, expect, it} from "vitest";
import {
  analyzeIterationHistory,
  type IterationSnapshot,
} from "./iteration-coach-analysis.js";
import {buildIterationCoachHistory} from "./iteration-coach.js";
import type {ArtifactStore} from "./artifacts.js";
import type {RunStore} from "./runs.js";

function snapshot(
  runId: string,
  savedAt: string,
  overrides: Partial<IterationSnapshot> = {},
): IterationSnapshot {
  return {
    runId,
    savedAt,
    buildKey: "a".repeat(40) + ":build-001",
    decision: "investigate",
    directStimulusHashes: ["1".repeat(64)],
    citedHumanEvidenceHashes: [],
    humanValidations: [],
    ...overrides,
  };
}

describe("iteration coach", () => {
  it("detects repeated review of the same build without a new direct stimulus", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z"),
      snapshot("run-b", "2026-08-14T11:00:00Z"),
    ]);

    expect(result.status).toBe("findings");
    expect(result.activeFindings.map(({id}) => id)).toContain("review-without-new-stimulus");
    expect(result.activeFindings[0]?.runIds).toEqual(["run-a", "run-b"]);
  });

  it("prioritizes a fix-now decision followed by another review of the same build", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {decision: "fix-now"}),
      snapshot("run-b", "2026-08-14T11:00:00Z"),
    ]);

    expect(result.activeFindings[0]?.id).toBe("fix-now-without-new-build");
    expect(result.card.highestPriorityFinding).toBe("fix-now-without-new-build");
    expect(result.card.nextAction).toMatch(/new build/i);
  });

  it("detects an unchanged human handoff question without new human evidence", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {
        humanValidations: [{
          question: "Can the player explain why the support failed?",
          humanEvidenceHashes: [],
        }],
      }),
      snapshot("run-b", "2026-08-14T11:00:00Z", {
        buildKey: "b".repeat(40) + ":build-002",
        directStimulusHashes: ["2".repeat(64)],
        humanValidations: [{
          question: "  can the player explain why the support failed?  ",
          humanEvidenceHashes: [],
        }],
      }),
    ]);

    expect(result.activeFindings.map(({id}) => id)).toContain("human-handoff-stall");
    const finding = result.activeFindings.find(({id}) => id === "human-handoff-stall");
    expect(finding?.facts).toMatchObject({
      repeatedQuestionCount: 1,
      novelHumanEvidenceCount: 0,
    });
  });

  it("does not flag progress when the build, direct stimulus, and human evidence advance", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {
        decision: "fix-now",
        humanValidations: [{
          question: "Can the player explain the result?",
          humanEvidenceHashes: [],
        }],
      }),
      snapshot("run-b", "2026-08-14T11:00:00Z", {
        buildKey: "b".repeat(40) + ":build-002",
        directStimulusHashes: ["2".repeat(64)],
        humanValidations: [{
          question: "Can the player explain the result?",
          humanEvidenceHashes: ["3".repeat(64)],
        }],
      }),
    ]);

    expect(result.status).toBe("clear");
    expect(result.activeFindings).toEqual([]);
    expect(result.card.highestPriorityFinding).toBeNull();
  });

  it("clears earlier findings after a later run satisfies their stop condition", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {decision: "fix-now"}),
      snapshot("run-b", "2026-08-14T11:00:00Z"),
      snapshot("run-c", "2026-08-14T12:00:00Z", {
        buildKey: "b".repeat(40) + ":build-002",
        directStimulusHashes: ["2".repeat(64)],
      }),
    ]);

    expect(result.status).toBe("clear");
    expect(result.activeFindings).toEqual([]);
    expect(result.findingHistory).toEqual([
      expect.objectContaining({
        id: "fix-now-without-new-build",
        status: "resolved",
        resolvedByRunId: "run-c",
      }),
      expect.objectContaining({
        id: "review-without-new-stimulus",
        status: "resolved",
        resolvedByRunId: "run-c",
      }),
    ]);
    expect(result.card.highestPriorityFinding).toBeNull();
  });

  it("does not treat an earlier stimulus as novel when it is alternated", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z"),
      snapshot("run-b", "2026-08-14T11:00:00Z", {
        directStimulusHashes: ["2".repeat(64)],
      }),
      snapshot("run-c", "2026-08-14T12:00:00Z"),
    ]);

    expect(result.status).toBe("findings");
    expect(result.activeFindings.map(({id}) => id)).toContain("review-without-new-stimulus");
    expect(result.activeFindings[0]?.runIds).toEqual(["run-b", "run-c"]);
  });

  it("does not let unrelated human evidence answer a repeated question", () => {
    const question = "Can the player explain why the support failed?";
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {
        humanValidations: [{question, humanEvidenceHashes: []}],
      }),
      snapshot("run-b", "2026-08-14T11:00:00Z", {
        buildKey: "b".repeat(40) + ":build-002",
        directStimulusHashes: ["2".repeat(64)],
        humanValidations: [
          {question, humanEvidenceHashes: []},
          {
            question: "Does the player understand the route reward?",
            humanEvidenceHashes: ["3".repeat(64)],
          },
        ],
      }),
    ]);

    expect(result.status).toBe("findings");
    expect(result.activeFindings.map(({id}) => id)).toContain("human-handoff-stall");
  });

  it("does not treat old human evidence as new when it is reassigned to the repeated question", () => {
    const repeatedQuestion = "Can the player explain why the support failed?";
    const existingHumanEvidence = "3".repeat(64);
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {
        citedHumanEvidenceHashes: [existingHumanEvidence],
        humanValidations: [{question: repeatedQuestion, humanEvidenceHashes: []}],
      }),
      snapshot("run-b", "2026-08-14T11:00:00Z", {
        buildKey: "b".repeat(40) + ":build-002",
        directStimulusHashes: ["2".repeat(64)],
        humanValidations: [{question: repeatedQuestion, humanEvidenceHashes: []}],
      }),
      snapshot("run-c", "2026-08-14T12:00:00Z", {
        buildKey: "c".repeat(40) + ":build-003",
        directStimulusHashes: ["4".repeat(64)],
        humanValidations: [{
          question: repeatedQuestion,
          humanEvidenceHashes: [existingHumanEvidence],
        }],
      }),
    ]);

    expect(result.status).toBe("findings");
    expect(result.activeFindings).toEqual([
      expect.objectContaining({
        id: "human-handoff-stall",
        status: "active",
        resolvedByRunId: null,
      }),
    ]);
  });

  it("resolves a human handoff only when the repeated question cites new human evidence", () => {
    const question = "Can the player explain why the support failed?";
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {
        humanValidations: [{question, humanEvidenceHashes: []}],
      }),
      snapshot("run-b", "2026-08-14T11:00:00Z", {
        buildKey: "b".repeat(40) + ":build-002",
        directStimulusHashes: ["2".repeat(64)],
        humanValidations: [{question, humanEvidenceHashes: []}],
      }),
      snapshot("run-c", "2026-08-14T12:00:00Z", {
        buildKey: "c".repeat(40) + ":build-003",
        directStimulusHashes: ["3".repeat(64)],
        humanValidations: [{
          question,
          humanEvidenceHashes: ["4".repeat(64)],
        }],
      }),
    ]);

    expect(result.status).toBe("clear");
    expect(result.activeFindings).toEqual([]);
    expect(result.findingHistory).toEqual([
      expect.objectContaining({
        id: "human-handoff-stall",
        status: "resolved",
        resolvedByRunId: "run-c",
      }),
    ]);
  });

  it("keeps one run as insufficient history instead of scoring it", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z"),
    ]);

    expect(result.status).toBe("insufficient-history");
    expect(result.activeFindings).toEqual([]);
    expect(result.card.nextAction).toMatch(/play-build/i);
  });

  it("collects only verified developer runs and uses cited stimulus hashes", async () => {
    const ids = {
      first: "00000000-0000-4000-8000-000000000001",
      second: "00000000-0000-4000-8000-000000000002",
      ignored: "00000000-0000-4000-8000-000000000003",
    };
    const records = new Map([
      [ids.first, runRecord(ids.first, "2026-08-14T10:00:00Z", "bundle-a", "eval-a")],
      [ids.second, runRecord(ids.second, "2026-08-14T11:00:00Z", "bundle-b", "eval-b")],
      [ids.ignored, {
        ...runRecord(ids.ignored, "2026-08-14T12:00:00Z", "bundle-c", "eval-c"),
        subjectKind: "existing-game",
      }],
    ]);
    const runStore = {
      listRuns: async () => [
        {id: ids.ignored},
        {id: ids.second},
        {id: ids.first},
      ],
      readRun: async (_target: string, id: string) => ({
        record: records.get(id),
        integrity: {status: "verified"},
      }),
    } as unknown as RunStore;
    const artifactStore = {
      readIntel: async (_target: string, id: string) => ({
        payload: auditBundleEnvelope(id),
      }),
      readEvaluation: async (_target: string, id: string) =>
        evaluationArtifact(id, id === "eval-a" ? "fix-now" : "investigate"),
    } as unknown as ArtifactStore;

    const result = await buildIterationCoachHistory(
      {runStore, artifactStore},
      {target: "Project Nyx", limit: 10},
    );

    expect(result.data.analyzedRunCount).toBe(2);
    expect(result.data.ignoredNonDeveloperRunCount).toBe(1);
    expect(result.data.activeFindings.map(({id}) => id)).toEqual([
      "fix-now-without-new-build",
      "review-without-new-stimulus",
      "human-handoff-stall",
    ]);
    expect(result.data.iterations[1]).toMatchObject({
      runId: ids.second,
      buildChangedFromPrevious: false,
      novelDirectStimulusCount: 0,
      novelHumanEvidenceCount: 0,
    });
    expect(result.data.boundaries).toContainEqual(
      expect.stringMatching(/SHA-256 is new[\s\S]*same persona round/iu),
    );
    expect(result.data.latestReviewDecision).toEqual({
      runId: ids.second,
      verdict: "HOLD",
      decision: "investigate",
      playerProblem: "The player cannot explain the observed result.",
      highestRisk: "The next build may preserve the same player-facing failure.",
      nextAction: "Operate the bounded task from eval-b.",
      successSignal: "The player can explain the result in eval-b.",
      sourceEvaluation: {
        ref: "final-evaluation",
        targetId: "project-nyx",
        id: "eval-b",
        sha256: "6".repeat(64),
      },
    });
  });

  it("binds human evidence only to the validation question in the citing persona round", async () => {
    const firstId = "00000000-0000-4000-8000-000000000006";
    const secondId = "00000000-0000-4000-8000-000000000007";
    const first = runRecord(firstId, "2026-08-14T10:00:00Z", "bundle-first", "eval-first");
    const second = runRecord(secondId, "2026-08-14T11:00:00Z", "bundle-second", "eval-second");
    second.evidence.push({
      ref: "human-measurement",
      kind: "intel",
      targetId: "project-nyx",
      id: "human-measurement",
      sha256: "7".repeat(64),
    });
    second.rounds.push({
      evidenceRefs: ["human-measurement"],
      playerSimulation: {
        stimulusEvidenceRefs: ["human-measurement"],
        reflection: {
          humanValidationQuestion: "Does the player understand the route reward?",
        },
      },
    });
    const records = new Map([[firstId, first], [secondId, second]]);
    const runStore = {
      listRuns: async () => [{id: secondId}, {id: firstId}],
      readRun: async (_target: string, id: string) => ({
        record: records.get(id),
        integrity: {status: "verified"},
      }),
    } as unknown as RunStore;
    const artifactStore = {
      readIntel: async (_target: string, id: string) => ({
        payload: id === "human-measurement"
          ? {data: humanMeasurement(), warnings: []}
          : auditBundleEnvelope(id),
      }),
      readEvaluation: async (_target: string, id: string) =>
        evaluationArtifact(id, "investigate"),
    } as unknown as ArtifactStore;

    const result = await buildIterationCoachHistory(
      {runStore, artifactStore},
      {target: "Project Nyx", limit: 2},
    );

    expect(result.data.activeFindings.map(({id}) => id)).toEqual([
      "human-handoff-stall",
    ]);
    expect(result.data.iterations[1]).toMatchObject({
      novelDirectStimulusCount: 1,
      novelHumanEvidenceCount: 1,
    });
  });

  it("does not count an unbound competitor image as a new build stimulus", async () => {
    const firstId = "00000000-0000-4000-8000-000000000008";
    const secondId = "00000000-0000-4000-8000-000000000009";
    const first = runRecord(firstId, "2026-08-14T10:00:00Z", "bundle-first", "eval-first");
    const second = runRecord(secondId, "2026-08-14T11:00:00Z", "bundle-second", "eval-second");
    second.evidence.push({
      ref: "competitor-reference",
      kind: "ui-reference",
      id: "competitor-reference",
      sha256: "8".repeat(64),
    });
    second.rounds[0]!.evidenceRefs.push("competitor-reference");
    second.rounds[0]!.playerSimulation!.stimulusEvidenceRefs.push("competitor-reference");
    second.rounds[0]!.playerSimulation!.reflection.humanValidationQuestion =
      "Can the player identify the next action?";
    const records = new Map([[firstId, first], [secondId, second]]);
    const runStore = {
      listRuns: async () => [{id: secondId}, {id: firstId}],
      readRun: async (_target: string, id: string) => ({
        record: records.get(id),
        integrity: {status: "verified"},
      }),
    } as unknown as RunStore;
    const artifactStore = {
      readIntel: async (_target: string, id: string) => ({
        payload: auditBundleEnvelope(id),
      }),
      readEvaluation: async (_target: string, id: string) =>
        evaluationArtifact(id, "investigate"),
    } as unknown as ArtifactStore;

    const result = await buildIterationCoachHistory(
      {runStore, artifactStore},
      {target: "Project Nyx", limit: 2},
    );

    expect(result.data.iterations[1]).toMatchObject({
      novelDirectStimulusCount: 0,
    });
    expect(result.data.activeFindings.map(({id}) => id)).toContain(
      "review-without-new-stimulus",
    );
  });

  it("excludes unreadable and failed-integrity runs instead of coaching from them", async () => {
    const unreadable = "00000000-0000-4000-8000-000000000004";
    const failedIntegrity = "00000000-0000-4000-8000-000000000005";
    const runStore = {
      listRuns: async () => [{id: failedIntegrity}, {id: unreadable}],
      readRun: async (_target: string, id: string) => {
        if (id === unreadable) throw new Error("unreadable fixture");
        return {
          record: runRecord(id, "2026-08-14T12:00:00Z", "bundle-d", "eval-d"),
          integrity: {status: "failed"},
        };
      },
    } as unknown as RunStore;
    const artifactStore = {
      readIntel: async () => {
        throw new Error("failed runs must not read bound intel");
      },
      readEvaluation: async () => {
        throw new Error("failed runs must not read evaluations");
      },
    } as unknown as ArtifactStore;

    const result = await buildIterationCoachHistory(
      {runStore, artifactStore},
      {target: "Project Nyx", limit: 2},
    );

    expect(result.data).toMatchObject({
      status: "insufficient-history",
      inspectedRunCount: 2,
      analyzedRunCount: 0,
      excludedIntegrityRunCount: 1,
      excludedUnreadableRunCount: 1,
      activeFindings: [],
      findingHistory: [],
    });
    expect(result.warnings).toHaveLength(2);
  });
});

function runRecord(
  runId: string,
  savedAt: string,
  bundleId: string,
  evaluationId: string,
) {
  return {
    runId,
    savedAt,
    subjectKind: "developer-project",
    mode: "baseline",
    auditSnapshotBundleRef: "snapshot-bundle",
    finalEvaluationRef: "final-evaluation",
    evidence: [
      {
        ref: "snapshot-bundle",
        kind: "intel",
        targetId: "project-nyx",
        id: bundleId,
        sha256: "4".repeat(64),
      },
      {
        ref: "combat-capture",
        kind: "capture",
        id: "combat-capture",
        sha256: "5".repeat(64),
      },
      {
        ref: "final-evaluation",
        kind: "evaluation",
        targetId: "project-nyx",
        id: evaluationId,
        sha256: "6".repeat(64),
      },
    ],
    rounds: [{
      evidenceRefs: ["combat-capture"],
      playerSimulation: {
        stimulusEvidenceRefs: ["combat-capture"],
        reflection: {
          humanValidationQuestion: "Can the player explain the structural failure?",
        },
      },
    }],
  };
}

function auditBundleEnvelope(bundleId: string) {
  return {
    data: {
      artifactType: "audit-snapshot-bundle",
      observedAt: "2026-08-14T09:00:00Z",
      snapshotId: bundleId,
      gitCommitSha: "a".repeat(40),
      buildId: "build-001",
      artifacts: [{
        evidenceRef: "combat-capture",
        kind: "capture",
        sha256: "5".repeat(64),
      }],
    },
    warnings: [],
    meta: {
      observedAt: "2026-08-14T09:00:00Z",
      resultHandle: "00000000-0000-4000-8000-000000000010",
    },
  };
}

function evaluationArtifact(
  id: string,
  decision: "fix-now" | "test-next-build" | "investigate" | "defer",
) {
  const verdict = "HOLD" as const;
  const highestRisk = "The next build may preserve the same player-facing failure.";
  const nextAction = `Operate the bounded task from ${id}.`;
  const successSignal = `The player can explain the result in ${id}.`;
  return {
    decisionCard: {
      verdict,
      decision,
      proven: ["Observed result [E-1]"],
      unproven: ["Player comprehension is unproven"],
      highestRisk,
      playerProblem: "The player cannot explain the observed result.",
      nextValidations: [{
        test: nextAction,
        successSignal,
        guardrail: "Do not add content before the task is readable.",
      }],
      confidence: "medium",
      revisitCondition: "Revisit after the bounded operation.",
    },
    developerSummary: {
      verdict,
      decision,
      highestRisk,
      nextAction,
      successSignal,
    },
  };
}

function humanMeasurement() {
  return {
    schemaVersion: 1,
    artifactType: "experiment-measurement",
    measurementId: "route-reward-human",
    experimentId: "route-reward",
    targetId: "project-nyx",
    metricId: "understood-reward",
    source: "human-playtest",
    instrument: "moderated first-contact question",
    unit: "participants",
    aggregation: "count",
    cohort: "first-time players",
    window: "first route result",
    scenarioResults: [{scenarioId: "current", value: 2, sampleSize: 3}],
    protocolDeviations: [],
  };
}
