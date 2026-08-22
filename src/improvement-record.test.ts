import {describe, expect, it} from "vitest";
import {
  buildImprovementRecord,
  ImprovementRecordInputSchema,
  type ImprovementRecordInput,
} from "./improvement-record.js";
import type {RunEvidenceResolver} from "./run-evidence.js";

function input(): ImprovementRecordInput {
  return {
    target: "Project Nyx",
    task: "Complete one delivery and read the result",
    controls: "Keyboard and mouse",
    startState: "At the dock before construction",
    endState: "The arrival result is visible",
    executionEnvironment: "Local Chromium at 1440x900",
    successSignal: "The result names the failed joint",
    successSignalKind: "visible-state",
    regressionGuardrail: "Restart remains available",
    regressionGuardrailKind: "input-response",
    baseline: {
      buildId: "nyx-044-baseline",
      operatedAt: "2026-08-22T17:20:00+04:00",
      gitCommitSha: "1".repeat(40),
      workingTreeDiffSha256: "2".repeat(64),
      actionResponseTrace: "Submit delivery → result opens → failed joint is omitted",
      successSignalObservation: "The failed joint is not named",
      regressionGuardrailObservation: "Restart returns to the dock",
      evidence: [{ref: "before", kind: "intel", target: "Project Nyx", id: "before-trace"}],
    },
    candidate: {
      buildId: "nyx-044-candidate",
      operatedAt: "2026-08-22T17:30:00+04:00",
      gitCommitSha: "1".repeat(40),
      workingTreeDiffSha256: "3".repeat(64),
      actionResponseTrace: "Submit delivery → result opens → failed joint is named",
      successSignalObservation: "The failed joint is named in the result",
      regressionGuardrailObservation: "Restart returns to the dock",
      evidence: [{ref: "after", kind: "intel", target: "Project Nyx", id: "after-trace"}],
    },
    changedFiles: ["src/result-panel.ts"],
    changeDiffSha256: "4".repeat(64),
    conditionsHeldConstant: true,
    conditionsHeldConstantEvidence: "Same browser, viewport, controls, start state, and task",
    successSignalResult: "improved",
    regressionGuardrailStatus: "held",
  };
}

const resolveEvidence: RunEvidenceResolver["resolveEvidence"] = async (reference) => ({
  record: {
    ref: reference.ref,
    kind: reference.kind,
    id: reference.id,
    path: `evidence/${reference.id}.json`,
    sha256: reference.ref === "before" ? "a".repeat(64) : "b".repeat(64),
    observedAt: reference.ref === "before"
      ? "2026-08-22T17:20:00+04:00"
      : "2026-08-22T17:30:00+04:00",
  },
  payload: reference.ref === "before"
    ? {
        artifactType: "improvement-operation-trace",
        buildId: "nyx-044-baseline",
        actionResponseTrace: "Submit delivery → result opens → failed joint is omitted",
        successSignalObservation: "The failed joint is not named",
        regressionGuardrailObservation: "Restart returns to the dock",
      }
    : {
        artifactType: "improvement-operation-trace",
        buildId: "nyx-044-candidate",
        actionResponseTrace: "Submit delivery → result opens → failed joint is named",
        successSignalObservation: "The failed joint is named in the result",
        regressionGuardrailObservation: "Restart returns to the dock",
      },
});

describe("improvement record", () => {
  it("binds matched replay protocol and resolved evidence hashes", async () => {
    const record = await buildImprovementRecord(input(), resolveEvidence);

    expect(record).toMatchObject({
      artifactType: "improvement-record",
      classification: "improved",
      baseline: {
        actionResponseTrace: expect.stringContaining("failed joint is omitted"),
        evidence: [{ref: "before", sha256: "a".repeat(64)}],
      },
      candidate: {
        actionResponseTrace: expect.stringContaining("failed joint is named"),
        evidence: [{ref: "after", sha256: "b".repeat(64)}],
      },
      replayProtocolSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("rejects shared evidence references", () => {
    const shared = input();
    shared.candidate.evidence = [{
      ref: "before",
      kind: "intel",
      target: "Project Nyx",
      id: "after-trace",
    }];
    expect(() => ImprovementRecordInputSchema.parse(shared)).toThrow(/disjoint/i);
  });

  it("requires replay-condition evidence and rejects caller-authored derived fields", () => {
    const {conditionsHeldConstantEvidence: _evidence, ...withoutEvidence} = input();
    expect(() => ImprovementRecordInputSchema.parse(withoutEvidence)).toThrow();
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      classification: "improved",
    })).toThrow(/unrecognized key/i);
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      observedAt: "2026-08-22T17:30:00+04:00",
    })).toThrow(/unrecognized key/i);
  });

  it("derives deterioration and guardrail regressions server-side", async () => {
    expect((await buildImprovementRecord({
      ...input(),
      successSignalResult: "regressed",
      regressionGuardrailStatus: "held",
    }, resolveEvidence)).classification).toBe("regressed");
    expect((await buildImprovementRecord({
      ...input(),
      successSignalResult: "improved",
      regressionGuardrailStatus: "failed",
    }, resolveEvidence)).classification).toBe("regressed");
    expect((await buildImprovementRecord({
      ...input(),
      successSignalResult: "unchanged",
    }, resolveEvidence)).classification).toBe("unchanged");
  });

  it("requires time-bound intel and rejects aliased evidence artifacts", () => {
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      baseline: {
        ...input().baseline,
        evidence: [{ref: "before-image", kind: "capture", id: "before-capture"}],
      },
    })).toThrow(/time-bound intel/i);
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      baseline: {
        ...input().baseline,
        evidence: [
          ...input().baseline.evidence,
          {ref: "before-alias", kind: "intel", target: "Project Nyx", id: "before-trace"},
        ],
      },
    })).toThrow(/artifacts must be unique/i);
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      candidate: {
        ...input().candidate,
        evidence: [{ref: "after", kind: "intel", target: "Project Nyx", id: "before-trace"}],
      },
    })).toThrow(/artifacts must be disjoint/i);
  });

  it("rejects commits, unchanged source identities, and unsafe paths", () => {
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      candidate: {...input().candidate, gitCommitSha: "5".repeat(40)},
    })).toThrow(/does not authorize a commit/i);
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      candidate: {
        ...input().candidate,
        workingTreeDiffSha256: input().baseline.workingTreeDiffSha256,
      },
    })).toThrow(/must differ/i);
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      changedFiles: ["../private.txt"],
    })).toThrow(/project-relative/i);
  });

  it("rejects cross-target or out-of-order evidence", () => {
    const crossTarget = input();
    crossTarget.baseline.evidence = [{
      ref: "before",
      kind: "intel",
      target: "Another Game",
      id: "before-trace",
    }];
    expect(() => ImprovementRecordInputSchema.parse(crossTarget)).toThrow(/improvement target/i);
    expect(() => ImprovementRecordInputSchema.parse({
      ...input(),
      baseline: {...input().baseline, operatedAt: input().candidate.operatedAt},
    })).toThrow(/after the baseline/i);
  });

  it("rejects evidence saved for a different operation time", async () => {
    const mismatchedEvidence: RunEvidenceResolver["resolveEvidence"] = async (reference) => ({
      record: {
        ref: reference.ref,
        kind: reference.kind,
        id: reference.id,
        path: `evidence/${reference.id}.json`,
        sha256: "a".repeat(64),
        observedAt: "2026-08-22T17:00:00+04:00",
      },
    });

    await expect(buildImprovementRecord(input(), mismatchedEvidence)).rejects.toThrow(
      /does not match its operation/i,
    );
  });

  it("rejects a canonical observation that differs from its saved trace", async () => {
    const mismatchedTrace: RunEvidenceResolver["resolveEvidence"] = async (reference) => {
      const resolved = await resolveEvidence(reference);
      return reference.ref === "after"
        ? {
            ...resolved,
            payload: {
              ...(resolved.payload as Record<string, unknown>),
              successSignalObservation: "An unrelated observation",
            },
          }
        : resolved;
    };

    await expect(buildImprovementRecord(input(), mismatchedTrace)).rejects.toThrow(
      /does not match a saved operation trace/i,
    );
  });

  it("rejects distinct references that resolve to the same stored artifact", async () => {
    const aliasedResolver: RunEvidenceResolver["resolveEvidence"] = async (reference) => {
      const resolved = await resolveEvidence(reference);
      return {
        ...resolved,
        record: {...resolved.record, path: "intel/project-nyx/shared.json"},
      };
    };

    await expect(buildImprovementRecord(input(), aliasedResolver)).rejects.toThrow(
      /same stored evidence artifact/i,
    );
  });
});
