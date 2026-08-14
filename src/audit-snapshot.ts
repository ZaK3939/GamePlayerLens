import {z} from "zod";
import {SnapshotArtifactBindingSchema} from "./revision-bundle.js";

const ReferenceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const GitCommitShaSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);

export const AuditSnapshotBundleObjectSchema = z.object({
  artifactType: z.literal("audit-snapshot-bundle"),
  observedAt: z.iso.datetime({offset: true}),
  snapshotId: ReferenceIdSchema,
  gitCommitSha: GitCommitShaSchema,
  buildId: z.string().trim().min(1).max(200),
  artifacts: z.array(SnapshotArtifactBindingSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  const refs = value.artifacts.map((artifact) => artifact.evidenceRef);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({
      code: "custom",
      path: ["artifacts"],
      message: "audit snapshot artifact evidence refs must be unique",
    });
  }
});

export const AuditSnapshotBundleEnvelopeSchema = z.object({
  data: AuditSnapshotBundleObjectSchema,
  warnings: z.array(z.string()),
  meta: z.object({
    observedAt: z.iso.datetime({offset: true}),
    resultHandle: z.uuid(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.meta.observedAt !== value.data.observedAt) {
    context.addIssue({
      code: "custom",
      path: ["meta", "observedAt"],
      message: "audit snapshot envelope and data observedAt must match",
    });
  }
});

export const AuditSnapshotBundleSchema = z.string().transform((input, context) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    context.addIssue({code: "custom", message: "auditSnapshotBundle must be valid JSON"});
    return z.NEVER;
  }
  const result = AuditSnapshotBundleObjectSchema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      context.addIssue({
        code: "custom",
        path: issue.path.map(String),
        message: issue.message,
      });
    }
    return z.NEVER;
  }
  return JSON.stringify(result.data);
});

interface ResolvedAuditEvidence {
  record: {
    ref: string;
    kind: string;
    sha256: string;
    sourceTool?: string;
  };
  payload?: unknown;
}

export function assertAuditSnapshotBundleBinding(
  bundleRef: string | undefined,
  resolvedEvidence: readonly ResolvedAuditEvidence[],
): void {
  const bundleEvidence = resolvedEvidence.find(
    ({record}) => record.ref === bundleRef && record.kind === "intel",
  );
  if (!bundleEvidence || bundleEvidence.record.sourceTool !== "manual") {
    throw new Error("developer-project audit snapshot must be exact-saved manual evidence");
  }
  const payload = bundleEvidence.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("audit snapshot bundle payload is invalid");
  }
  const bundle = AuditSnapshotBundleEnvelopeSchema.parse(payload).data;
  for (const binding of bundle.artifacts) {
    const evidence = resolvedEvidence.find(
      ({record}) => record.ref === binding.evidenceRef,
    )?.record;
    if (!evidence) {
      throw new Error(`audit snapshot evidence is missing: ${binding.evidenceRef}`);
    }
    if (evidence.kind !== binding.kind || evidence.sha256 !== binding.sha256) {
      throw new Error(`audit snapshot evidence binding mismatch: ${binding.evidenceRef}`);
    }
  }
}

export type AuditSnapshotBundle = z.infer<typeof AuditSnapshotBundleObjectSchema>;
