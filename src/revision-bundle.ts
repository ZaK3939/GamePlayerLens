import {z} from "zod";

const ReferenceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const GitCommitShaSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);

export const SnapshotArtifactBindingSchema = z.object({
  evidenceRef: ReferenceIdSchema,
  kind: z.enum(["intel", "capture", "ui-reference"]),
  sha256: Sha256Schema,
}).strict();

const RevisionSnapshotSchema = z.object({
  revisionId: z.string().trim().min(1).max(200),
  gitCommitSha: GitCommitShaSchema,
  buildId: z.string().trim().min(1).max(200),
  artifacts: z.array(SnapshotArtifactBindingSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  const refs = value.artifacts.map((artifact) => artifact.evidenceRef);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({
      code: "custom",
      path: ["artifacts"],
      message: "revision artifact evidence refs must be unique",
    });
  }
});

export const RevisionBundleObjectSchema = z.object({
  artifactType: z.literal("revision-bundle"),
  observedAt: z.iso.datetime({offset: true}),
  current: RevisionSnapshotSchema,
  candidate: RevisionSnapshotSchema,
  changedAreas: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  invariantsKept: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
}).strict().superRefine((value, context) => {
  if (value.current.revisionId === value.candidate.revisionId) {
    context.addIssue({
      code: "custom",
      path: ["candidate", "revisionId"],
      message: "candidate revisionId must differ from current revisionId",
    });
  }
  if (value.current.gitCommitSha === value.candidate.gitCommitSha) {
    context.addIssue({
      code: "custom",
      path: ["candidate", "gitCommitSha"],
      message: "candidate gitCommitSha must differ from current gitCommitSha",
    });
  }
  const currentRefs = new Set(
    value.current.artifacts.map((artifact) => artifact.evidenceRef),
  );
  for (const artifact of value.candidate.artifacts) {
    if (currentRefs.has(artifact.evidenceRef)) {
      context.addIssue({
        code: "custom",
        path: ["candidate", "artifacts"],
        message: `revision evidence cannot represent both snapshots: ${artifact.evidenceRef}`,
      });
    }
  }
});

export const RevisionBundleEnvelopeSchema = z.object({
  data: RevisionBundleObjectSchema,
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
      message: "revision bundle envelope and data observedAt must match",
    });
  }
});

export const RevisionBundleSchema = z.string().transform((input, context) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    context.addIssue({code: "custom", message: "revisionBundle must be valid JSON"});
    return z.NEVER;
  }
  const result = RevisionBundleObjectSchema.safeParse(parsed);
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

interface ResolvedRevisionEvidence {
  record: {
    ref: string;
    kind: string;
    sha256: string;
    sourceTool?: string;
  };
  payload?: unknown;
}

export function assertRevisionBundleBinding(
  revisionBundleRef: string | undefined,
  resolvedEvidence: readonly ResolvedRevisionEvidence[],
): void {
  const bundleEvidence = resolvedEvidence.find(
    ({record}) => record.ref === revisionBundleRef && record.kind === "intel",
  );
  if (!bundleEvidence || bundleEvidence.record.sourceTool !== "manual") {
    throw new Error("change run revision bundle must be exact-saved manual evidence");
  }
  const payload = bundleEvidence.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("change run revision bundle payload is invalid");
  }
  const bundle = RevisionBundleEnvelopeSchema.parse(payload).data;
  for (const snapshot of [bundle.current, bundle.candidate]) {
    for (const binding of snapshot.artifacts) {
      const evidence = resolvedEvidence.find(
        ({record}) => record.ref === binding.evidenceRef,
      )?.record;
      if (!evidence) {
        throw new Error(`revision bundle evidence is missing: ${binding.evidenceRef}`);
      }
      if (evidence.kind !== binding.kind || evidence.sha256 !== binding.sha256) {
        throw new Error(`revision bundle evidence binding mismatch: ${binding.evidenceRef}`);
      }
    }
  }
}

export type RevisionBundle = z.infer<typeof RevisionBundleObjectSchema>;
