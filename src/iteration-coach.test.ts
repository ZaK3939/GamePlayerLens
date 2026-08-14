import {describe, expect, it} from "vitest";
import {
  analyzeIterationHistory,
  buildIterationCoachHistory,
  type IterationSnapshot,
} from "./iteration-coach.js";
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
    humanEvidenceHashes: [],
    humanValidationQuestions: [],
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
    expect(result.findings.map(({id}) => id)).toContain("review-without-new-stimulus");
    expect(result.findings[0]?.runIds).toEqual(["run-a", "run-b"]);
  });

  it("prioritizes a fix-now decision followed by another review of the same build", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {decision: "fix-now"}),
      snapshot("run-b", "2026-08-14T11:00:00Z"),
    ]);

    expect(result.findings[0]?.id).toBe("fix-now-without-new-build");
    expect(result.card.highestPriorityFinding).toBe("fix-now-without-new-build");
    expect(result.card.nextAction).toMatch(/new build/i);
  });

  it("detects an unchanged human handoff question without new human evidence", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {
        humanValidationQuestions: ["Can the player explain why the support failed?"],
      }),
      snapshot("run-b", "2026-08-14T11:00:00Z", {
        buildKey: "b".repeat(40) + ":build-002",
        directStimulusHashes: ["2".repeat(64)],
        humanValidationQuestions: ["  can the player explain why the support failed?  "],
      }),
    ]);

    expect(result.findings.map(({id}) => id)).toContain("human-handoff-stall");
    const finding = result.findings.find(({id}) => id === "human-handoff-stall");
    expect(finding?.facts).toMatchObject({
      repeatedQuestionCount: 1,
      newHumanEvidenceCount: 0,
    });
  });

  it("does not flag progress when the build, direct stimulus, and human evidence advance", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z", {
        decision: "fix-now",
        humanValidationQuestions: ["Can the player explain the result?"],
      }),
      snapshot("run-b", "2026-08-14T11:00:00Z", {
        buildKey: "b".repeat(40) + ":build-002",
        directStimulusHashes: ["2".repeat(64)],
        humanEvidenceHashes: ["3".repeat(64)],
        humanValidationQuestions: ["Can the player explain the result?"],
      }),
    ]);

    expect(result.status).toBe("clear");
    expect(result.findings).toEqual([]);
    expect(result.card.highestPriorityFinding).toBeNull();
  });

  it("keeps one run as insufficient history instead of scoring it", () => {
    const result = analyzeIterationHistory([
      snapshot("run-a", "2026-08-14T10:00:00Z"),
    ]);

    expect(result.status).toBe("insufficient-history");
    expect(result.findings).toEqual([]);
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
      readEvaluation: async (_target: string, id: string) => ({
        decisionCard: {
          decision: id === "eval-a" ? "fix-now" : "investigate",
        },
      }),
    } as unknown as ArtifactStore;

    const result = await buildIterationCoachHistory(
      {runStore, artifactStore},
      {target: "Project Nyx", limit: 10},
    );

    expect(result.data.analyzedRunCount).toBe(2);
    expect(result.data.ignoredNonDeveloperRunCount).toBe(1);
    expect(result.data.findings.map(({id}) => id)).toEqual([
      "fix-now-without-new-build",
      "review-without-new-stimulus",
      "human-handoff-stall",
    ]);
    expect(result.data.iterations[1]).toMatchObject({
      runId: ids.second,
      buildChangedFromPrevious: false,
      newDirectStimulusCount: 0,
      newHumanEvidenceCount: 0,
    });
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
      findings: [],
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
