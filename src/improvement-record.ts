import {z} from "zod";
import {canonicalSha256} from "./integrity.js";
import type {RunEvidenceResolver} from "./run-evidence.js";

const BoundedTextSchema = z.string().trim().min(1).max(2_000);
const ReferenceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const GitCommitShaSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const ObservableSignalKindSchema = z.enum([
  "visible-state",
  "input-response",
  "state-transition",
  "audio-response",
  "error-recovery",
]);
const ImprovementOperationTraceSchema = z.object({
  artifactType: z.literal("improvement-operation-trace"),
  buildId: z.string().trim().min(1).max(200),
  actionResponseTrace: BoundedTextSchema,
  successSignalObservation: BoundedTextSchema,
  regressionGuardrailObservation: BoundedTextSchema,
}).strict();
const EvidenceReferenceSchema = z.discriminatedUnion("kind", [
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("intel"),
    target: z.string().trim().min(1).max(120),
    id: z.string().trim().min(1).max(120),
  }).strict(),
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("capture"),
    id: z.string().trim().min(1).max(120),
  }).strict(),
]);

function evidenceLocator(reference: z.infer<typeof EvidenceReferenceSchema>): string {
  return reference.kind === "intel"
    ? `${reference.kind}:${reference.target}:${reference.id}`
    : `${reference.kind}:${reference.id}`;
}

const SourceIdentitySchema = z.object({
  buildId: z.string().trim().min(1).max(200).describe("Identity of the operated build"),
  operatedAt: z.iso.datetime({offset: true}).describe("Exact time this build operation occurred"),
  gitCommitSha: GitCommitShaSchema.describe("Repository HEAD used for this operation"),
  workingTreeDiffSha256: Sha256Schema.describe("SHA-256 of the complete binary working-tree diff at this operation"),
  actionResponseTrace: BoundedTextSchema.describe("Compact player action to observable response trace"),
  successSignalObservation: BoundedTextSchema.describe("What was directly observed for the declared success signal"),
  regressionGuardrailObservation: BoundedTextSchema.describe("What was directly observed for the declared regression guardrail"),
  evidence: z.array(EvidenceReferenceSchema).min(1).max(12).describe(
    "Disjoint exact-saved evidence, including one intel payload with artifactType improvement-operation-trace whose buildId and observation fields exactly match this snapshot",
  ),
}).strict().superRefine((value, context) => {
  const refs = value.evidence.map(({ref}) => ref);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({
      code: "custom",
      path: ["evidence"],
      message: "improvement evidence refs must be unique",
    });
  }
  const locators = value.evidence.map(evidenceLocator);
  if (new Set(locators).size !== locators.length) {
    context.addIssue({
      code: "custom",
      path: ["evidence"],
      message: "improvement evidence artifacts must be unique",
    });
  }
  if (!value.evidence.some(({kind}) => kind === "intel")) {
    context.addIssue({
      code: "custom",
      path: ["evidence"],
      message: "each improvement snapshot requires time-bound intel evidence",
    });
  }
});
const RelativeFileSchema = z.string().trim().min(1).max(500).superRefine(
  (value, context) => {
    const segments = value.split("/");
    if (
      value.startsWith("/")
      || value.includes("\\")
      || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
      context.addIssue({
        code: "custom",
        message: "changed files must be canonical project-relative paths",
      });
    }
  },
);

export const ImprovementRecordInputSchema = z.object({
  target: z.string().trim().min(1).max(120).describe("Game or build target shared by both operations"),
  task: BoundedTextSchema.describe("Identical bounded player task used for baseline and candidate"),
  controls: BoundedTextSchema.describe("Identical controls used for both operations"),
  startState: BoundedTextSchema.describe("Identical start state used for both operations"),
  endState: BoundedTextSchema.describe("Identical intended end state used for both operations"),
  executionEnvironment: BoundedTextSchema.describe("Browser, device, viewport, and other relevant environment held constant"),
  successSignal: BoundedTextSchema.describe("Directly observable behavior the edit intended to improve"),
  successSignalKind: ObservableSignalKindSchema.describe("Observable class of the success signal"),
  regressionGuardrail: BoundedTextSchema.describe("Directly observable behavior that must remain intact"),
  regressionGuardrailKind: ObservableSignalKindSchema.describe("Observable class of the regression guardrail"),
  baseline: SourceIdentitySchema.describe("Source identity, observations, and evidence before the edit"),
  candidate: SourceIdentitySchema.describe("Source identity, observations, and evidence after the edit"),
  changedFiles: z.array(RelativeFileSchema).min(1).max(20).refine(
    (values) => new Set(values).size === values.length,
    "changedFiles must be unique",
  ).describe("Canonical project-relative files in the isolated improvement patch"),
  changeDiffSha256: Sha256Schema.describe("SHA-256 of the exact isolated patch applied by this improvement attempt"),
  conditionsHeldConstant: z.literal(true).describe("Assertion that relevant replay conditions were held constant"),
  conditionsHeldConstantEvidence: BoundedTextSchema.describe("Concise evidence explaining how relevant replay conditions were held constant"),
  successSignalResult: z.enum(["improved", "unchanged", "regressed"]).describe("Observed baseline-to-candidate direction for the success signal"),
  regressionGuardrailStatus: z.enum(["held", "failed"]).describe("Observed candidate result for the regression guardrail"),
}).strict().superRefine((value, context) => {
  if (value.baseline.buildId === value.candidate.buildId) {
    context.addIssue({
      code: "custom",
      path: ["candidate", "buildId"],
      message: "candidate buildId must differ from baseline buildId",
    });
  }
  if (Date.parse(value.baseline.operatedAt) >= Date.parse(value.candidate.operatedAt)) {
    context.addIssue({
      code: "custom",
      path: ["candidate", "operatedAt"],
      message: "candidate operation must occur after the baseline operation",
    });
  }
  if (value.baseline.gitCommitSha !== value.candidate.gitCommitSha) {
    context.addIssue({
      code: "custom",
      path: ["candidate", "gitCommitSha"],
      message: "improve_build does not authorize a commit between baseline and candidate",
    });
  }
  if (value.baseline.workingTreeDiffSha256 === value.candidate.workingTreeDiffSha256) {
    context.addIssue({
      code: "custom",
      path: ["candidate", "workingTreeDiffSha256"],
      message: "candidate working-tree identity must differ from baseline",
    });
  }
  const baselineRefs = new Set(value.baseline.evidence.map(({ref}) => ref));
  if (value.candidate.evidence.some(({ref}) => baselineRefs.has(ref))) {
    context.addIssue({
      code: "custom",
      path: ["candidate", "evidence"],
      message: "baseline and candidate evidence refs must be disjoint",
    });
  }
  const baselineEvidence = new Set(value.baseline.evidence.map(evidenceLocator));
  if (value.candidate.evidence.some((reference) => baselineEvidence.has(evidenceLocator(reference)))) {
    context.addIssue({
      code: "custom",
      path: ["candidate", "evidence"],
      message: "baseline and candidate evidence artifacts must be disjoint",
    });
  }
  for (const [snapshotName, snapshot] of [
    ["baseline", value.baseline],
    ["candidate", value.candidate],
  ] as const) {
    snapshot.evidence.forEach((reference, index) => {
      if (reference.kind === "intel" && reference.target !== value.target) {
        context.addIssue({
          code: "custom",
          path: [snapshotName, "evidence", index, "target"],
          message: "improvement intel evidence must use the improvement target",
        });
      }
    });
  }
});

export type ImprovementRecordInput = z.infer<typeof ImprovementRecordInputSchema>;

export async function buildImprovementRecord(
  input: ImprovementRecordInput,
  resolveEvidence: RunEvidenceResolver["resolveEvidence"],
) {
  const parsed = ImprovementRecordInputSchema.parse(input);
  const resolveSnapshot = async (snapshot: ImprovementRecordInput["baseline"]) => {
    const resolvedEvidence = await Promise.all(
      snapshot.evidence.map((reference) => resolveEvidence(reference)),
    );
    const evidence = resolvedEvidence.map(({record}) => record);
    if (evidence.some((record) =>
      record.observedAt !== undefined
      && Date.parse(record.observedAt) !== Date.parse(snapshot.operatedAt))) {
      throw new Error("improvement evidence observedAt does not match its operation");
    }
    const hasMatchingTrace = resolvedEvidence.some(({record, payload}) => {
      if (record.kind !== "intel") return false;
      const trace = ImprovementOperationTraceSchema.safeParse(payload);
      return trace.success
        && trace.data.buildId === snapshot.buildId
        && trace.data.actionResponseTrace === snapshot.actionResponseTrace
        && trace.data.successSignalObservation === snapshot.successSignalObservation
        && trace.data.regressionGuardrailObservation === snapshot.regressionGuardrailObservation;
    });
    if (!hasMatchingTrace) {
      throw new Error("improvement snapshot does not match a saved operation trace");
    }
    return {
      buildId: snapshot.buildId,
      operatedAt: snapshot.operatedAt,
      gitCommitSha: snapshot.gitCommitSha,
      workingTreeDiffSha256: snapshot.workingTreeDiffSha256,
      actionResponseTrace: snapshot.actionResponseTrace,
      successSignalObservation: snapshot.successSignalObservation,
      regressionGuardrailObservation: snapshot.regressionGuardrailObservation,
      evidence,
    };
  };
  const protocol = {
    task: parsed.task,
    controls: parsed.controls,
    startState: parsed.startState,
    endState: parsed.endState,
    executionEnvironment: parsed.executionEnvironment,
    successSignal: parsed.successSignal,
    successSignalKind: parsed.successSignalKind,
    regressionGuardrail: parsed.regressionGuardrail,
    regressionGuardrailKind: parsed.regressionGuardrailKind,
  };
  const baseline = await resolveSnapshot(parsed.baseline);
  const candidate = await resolveSnapshot(parsed.candidate);
  const baselineEvidencePaths = new Set(baseline.evidence.map(({kind, path}) => `${kind}:${path}`));
  if (candidate.evidence.some(({kind, path}) => baselineEvidencePaths.has(`${kind}:${path}`))) {
    throw new Error("baseline and candidate resolve to the same stored evidence artifact");
  }
  const classification = parsed.regressionGuardrailStatus === "failed"
    || parsed.successSignalResult === "regressed"
    ? "regressed"
    : parsed.successSignalResult;
  return {
    schemaVersion: 1,
    artifactType: "improvement-record",
    target: parsed.target,
    observedAt: parsed.candidate.operatedAt,
    protocol,
    replayProtocolSha256: canonicalSha256(protocol),
    baseline,
    candidate,
    changedFiles: parsed.changedFiles,
    changeDiffSha256: parsed.changeDiffSha256,
    conditionsHeldConstant: true,
    conditionsHeldConstantEvidence: parsed.conditionsHeldConstantEvidence,
    classification,
    successSignalResult: parsed.successSignalResult,
    regressionGuardrailStatus: parsed.regressionGuardrailStatus,
    limitations: [
      "Stored evidence bytes are verified and hash-bound; source identities are caller-supplied and are not independently attested against an external build system.",
      "Signal and guardrail interpretations are caller-supplied; this record derives their classification consistently but does not infer those interpretations from the evidence content.",
      "The record establishes one matched AI-operated comparison, not human enjoyment, comprehension, demand, retention, or purchase intent.",
    ],
  } as const;
}
