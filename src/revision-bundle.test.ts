import {describe, expect, it} from "vitest";
import {
  RevisionBundleObjectSchema,
  RevisionBundleEnvelopeSchema,
  RevisionBundleSchema,
} from "./revision-bundle.js";

function bundle() {
  return {
    artifactType: "revision-bundle" as const,
    observedAt: "2026-08-14T12:00:00+04:00",
    current: {
      revisionId: "current-v1",
      gitCommitSha: "a".repeat(40),
      buildId: "build-current",
      artifacts: [{
        evidenceRef: "current-capture",
        kind: "capture" as const,
        sha256: "1".repeat(64),
      }],
    },
    candidate: {
      revisionId: "candidate-v2",
      gitCommitSha: "b".repeat(40),
      buildId: "build-candidate",
      artifacts: [{
        evidenceRef: "candidate-capture",
        kind: "capture" as const,
        sha256: "2".repeat(64),
      }],
    },
    changedAreas: ["combat result feedback"],
    invariantsKept: ["seed, viewport, renderer, and input sequence"],
  };
}

describe("revision bundle", () => {
  it("requires two distinct, artifact-bound revisions", () => {
    expect(RevisionBundleObjectSchema.parse(bundle())).toEqual(bundle());
    expect(JSON.parse(RevisionBundleSchema.parse(JSON.stringify(bundle())))).toEqual(bundle());
  });

  it("rejects a reused commit or evidence ref", () => {
    expect(RevisionBundleObjectSchema.safeParse({
      ...bundle(),
      candidate: {
        ...bundle().candidate,
        gitCommitSha: bundle().current.gitCommitSha,
        artifacts: bundle().current.artifacts,
      },
    }).success).toBe(false);
  });

  it("requires exact-save envelope timestamps to match the bundle", () => {
    expect(RevisionBundleEnvelopeSchema.safeParse({
      data: bundle(),
      warnings: [],
      meta: {
        observedAt: "2026-08-14T12:01:00+04:00",
        resultHandle: "33333333-3333-4333-8333-333333333333",
      },
    }).success).toBe(false);
  });
});
