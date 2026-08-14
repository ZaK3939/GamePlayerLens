import {describe, expect, it} from "vitest";
import {
  assertAuditSnapshotBundleBinding,
  AuditSnapshotBundleEnvelopeSchema,
  AuditSnapshotBundleObjectSchema,
  AuditSnapshotBundleSchema,
} from "./audit-snapshot.js";

function bundle() {
  return {
    artifactType: "audit-snapshot-bundle" as const,
    observedAt: "2026-08-14T12:00:00+04:00",
    snapshotId: "slot-ember-build-042",
    gitCommitSha: "a".repeat(40),
    buildId: "webgl2-042",
    artifacts: [
      {evidenceRef: "capture", kind: "capture" as const, sha256: "1".repeat(64)},
      {evidenceRef: "receipt", kind: "intel" as const, sha256: "2".repeat(64)},
    ],
  };
}

describe("audit snapshot bundle", () => {
  it("normalizes one build bound to saved artifact hashes", () => {
    expect(AuditSnapshotBundleObjectSchema.parse(bundle())).toEqual(bundle());
    expect(JSON.parse(AuditSnapshotBundleSchema.parse(JSON.stringify(bundle()))))
      .toEqual(bundle());
  });

  it("rejects duplicate evidence and mismatched envelope timestamps", () => {
    expect(AuditSnapshotBundleObjectSchema.safeParse({
      ...bundle(),
      artifacts: [bundle().artifacts[0], bundle().artifacts[0]],
    }).success).toBe(false);
    expect(AuditSnapshotBundleEnvelopeSchema.safeParse({
      data: bundle(),
      warnings: [],
      meta: {
        observedAt: "2026-08-14T12:01:00+04:00",
        resultHandle: "33333333-3333-4333-8333-333333333333",
      },
    }).success).toBe(false);
  });

  it("server-verifies every referenced artifact kind and hash", () => {
    const resolved = [
      {
        record: {
          ref: "snapshot-bundle",
          kind: "intel",
          sha256: "3".repeat(64),
          sourceTool: "manual",
        },
        payload: {
          data: bundle(),
          warnings: [],
          meta: {
            observedAt: bundle().observedAt,
            resultHandle: "33333333-3333-4333-8333-333333333333",
          },
        },
      },
      {record: {ref: "capture", kind: "capture", sha256: "1".repeat(64)}},
      {record: {ref: "receipt", kind: "intel", sha256: "2".repeat(64)}},
    ];

    expect(() => assertAuditSnapshotBundleBinding("snapshot-bundle", resolved))
      .not.toThrow();
    expect(() => assertAuditSnapshotBundleBinding(
      "snapshot-bundle",
      resolved.map((item) => item.record.ref === "receipt"
        ? {...item, record: {...item.record, sha256: "4".repeat(64)}}
        : item),
    )).toThrow("audit snapshot evidence binding mismatch: receipt");
  });
});
