import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {
  ArtifactStore,
  IntelArtifactMetadata,
} from "./artifacts.js";

const BoundedTextSchema = z.string().trim().min(1).max(2_000);
const SignalKeySchema = z.string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const SessionIdSchema = z.string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i);
const ToolNameSchema = z.string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);
const FieldNameSchema = z.string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-zA-Z0-9_.-]*$/);
const ErrorCodeSchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/i);

const SENSITIVE_TEXT_PATTERNS = [
  /authorization\s*:\s*bearer\s+\S+/iu,
  /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*\S+/iu,
  /https?:\/\/[^/\s:@]+:[^@\s/]+@/iu,
  /(?:^|\s)\/(?:Users|home|workspace|private|tmp|var|etc)\/[\w./-]+/u,
  /(?:^|\s)[a-z]:\\(?:Users|Documents|workspace|private|tmp)\\[^\s]+/iu,
] as const;

function containsSensitiveText(value: unknown): boolean {
  if (typeof value === "string") {
    return SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) return value.some(containsSensitiveText);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsSensitiveText);
  }
  return false;
}

export const AgentExperienceSurfaceSchema = z.enum([
  "mcp",
  "skill",
  "onboarding",
]);
export const AgentExperienceStageSchema = z.enum([
  "discover",
  "install",
  "connect",
  "understand",
  "invoke",
  "interpret",
  "persist",
  "handoff",
]);
export const AgentExperienceOutcomeSchema = z.enum([
  "success",
  "partial",
  "failure",
  "confusion",
  "guess",
  "gave-up",
  "feature-request",
]);
const ReuseSchema = z.enum(["yes", "no", "unsure"]);
const RecommendationSchema = z.enum(["recommend", "neutral", "not-recommend"]);

export const AgentExperienceFeedbackInputSchema = z.object({
  surface: AgentExperienceSurfaceSchema,
  stage: AgentExperienceStageSchema,
  outcome: AgentExperienceOutcomeSchema,
  signalKey: SignalKeySchema,
  sessionId: SessionIdSchema.optional(),
  userIntent: BoundedTextSchema,
  task: BoundedTextSchema,
  relatedTool: ToolNameSchema.optional(),
  summary: BoundedTextSchema,
  attemptedRecovery: BoundedTextSchema.optional(),
  missingCapability: BoundedTextSchema.optional(),
  errorCode: ErrorCodeSchema.optional(),
  guessedFields: z.array(FieldNameSchema).max(12).default([]).refine(
    (values) => new Set(values).size === values.length,
    "guessedFields must be unique",
  ),
  wouldReuse: ReuseSchema,
  recommendation: RecommendationSchema,
  privacyConfirmed: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.outcome === "guess" && value.guessedFields.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["guessedFields"],
      message: "guess outcomes require guessedFields",
    });
  }
  if (
    (value.outcome === "failure" || value.outcome === "gave-up")
    && !value.attemptedRecovery
  ) {
    context.addIssue({
      code: "custom",
      path: ["attemptedRecovery"],
      message: "failure and gave-up outcomes require attemptedRecovery",
    });
  }
  if (value.outcome === "feature-request" && !value.missingCapability) {
    context.addIssue({
      code: "custom",
      path: ["missingCapability"],
      message: "feature-request outcomes require missingCapability",
    });
  }
  if (containsSensitiveText(value)) {
    context.addIssue({
      code: "custom",
      path: [],
      message: "feedback contains sensitive data, credentials, or absolute paths",
    });
  }
});

export const AgentExperienceFeedbackRecordSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal("agent-experience-feedback"),
  feedbackId: z.uuid(),
  product: z.literal("game-player-lens"),
  productVersion: z.string().min(1).max(32),
  reportedAt: z.iso.datetime({offset: true}),
  surface: AgentExperienceSurfaceSchema,
  stage: AgentExperienceStageSchema,
  outcome: AgentExperienceOutcomeSchema,
  signalKey: SignalKeySchema,
  sessionId: SessionIdSchema.optional(),
  userIntent: BoundedTextSchema,
  task: BoundedTextSchema,
  relatedTool: ToolNameSchema.optional(),
  summary: BoundedTextSchema,
  attemptedRecovery: BoundedTextSchema.optional(),
  missingCapability: BoundedTextSchema.optional(),
  errorCode: ErrorCodeSchema.optional(),
  guessedFields: z.array(FieldNameSchema).max(12),
  wouldReuse: ReuseSchema,
  recommendation: RecommendationSchema,
  privacy: z.string().min(1),
}).strict();

export type AgentExperienceFeedbackInput = z.infer<
  typeof AgentExperienceFeedbackInputSchema
>;
export type AgentExperienceFeedbackRecord = z.infer<
  typeof AgentExperienceFeedbackRecordSchema
>;

export interface AgentExperienceRecordDependencies {
  clock?: () => Date;
  idFactory?: () => string;
  productVersion: string;
}

export const AGENT_EXPERIENCE_TARGET = "GamePlayerLens Agent Experience";

export const AgentExperienceSummaryInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
  surface: AgentExperienceSurfaceSchema.optional(),
  outcome: AgentExperienceOutcomeSchema.optional(),
  productVersion: z.string().trim().min(1).max(32).optional(),
}).strict();

export type AgentExperienceSummaryInput = z.input<
  typeof AgentExperienceSummaryInputSchema
>;

export function createAgentExperienceFeedbackRecord(
  input: AgentExperienceFeedbackInput,
  dependencies: AgentExperienceRecordDependencies,
): AgentExperienceFeedbackRecord {
  const parsed = AgentExperienceFeedbackInputSchema.parse(input);
  const {privacyConfirmed: _privacyConfirmed, ...feedback} = parsed;
  return AgentExperienceFeedbackRecordSchema.parse({
    schemaVersion: 1,
    artifactType: "agent-experience-feedback",
    feedbackId: (dependencies.idFactory ?? randomUUID)(),
    product: "game-player-lens",
    productVersion: dependencies.productVersion,
    reportedAt: (dependencies.clock ?? (() => new Date()))().toISOString(),
    ...feedback,
    privacy: "Reporter confirmed: no raw prompt, credential, absolute path, or proprietary artifact content.",
  });
}

const OUTCOMES = AgentExperienceOutcomeSchema.options;
const SURFACES = AgentExperienceSurfaceSchema.options;
const STAGES = AgentExperienceStageSchema.options;
const REUSE = ReuseSchema.options;
const RECOMMENDATIONS = RecommendationSchema.options;

function countValues<T extends string>(
  values: readonly T[],
  possible: readonly T[],
): Record<T, number> {
  const counts = Object.fromEntries(possible.map((value) => [value, 0])) as Record<T, number>;
  values.forEach((value) => {
    counts[value] += 1;
  });
  return counts;
}

const OUTCOME_IMPACT: Record<z.infer<typeof AgentExperienceOutcomeSchema>, number> = {
  "gave-up": 0,
  failure: 1,
  "feature-request": 2,
  confusion: 3,
  guess: 4,
  partial: 5,
  success: 6,
};

export function buildAgentExperienceSummary(
  input: readonly AgentExperienceFeedbackRecord[],
) {
  const reports = input.map((report) => AgentExperienceFeedbackRecordSchema.parse(report))
    .sort((left, right) =>
      left.reportedAt.localeCompare(right.reportedAt)
      || left.feedbackId.localeCompare(right.feedbackId));
  const issueGroups = new Map<string, AgentExperienceFeedbackRecord[]>();
  for (const report of reports) {
    if (report.outcome === "success") continue;
    const group = issueGroups.get(report.signalKey) ?? [];
    group.push(report);
    issueGroups.set(report.signalKey, group);
  }
  const issueCandidates = [...issueGroups.entries()].map(([signalKey, grouped]) => {
    const distinctSessionCount = new Set(
      grouped.flatMap(({sessionId}) => sessionId ? [sessionId] : []),
    ).size;
    const readyForIssueDraft = distinctSessionCount >= 2;
    const outcomes = [...new Set(grouped.map(({outcome}) => outcome))]
      .sort((left, right) => OUTCOME_IMPACT[left] - OUTCOME_IMPACT[right]);
    return {
      signalKey,
      reportCount: grouped.length,
      distinctSessionCount,
      outcomes,
      surfaces: [...new Set(grouped.map(({surface}) => surface))].sort(),
      productVersions: [...new Set(grouped.map(({productVersion}) => productVersion))].sort(),
      relatedTools: [...new Set(grouped.flatMap(({relatedTool}) =>
        relatedTool ? [relatedTool] : []))].sort(),
      latestReportedAt: grouped.at(-1)!.reportedAt,
      exampleSummaries: grouped.slice(-3).map(({summary}) => summary),
      readyForIssueDraft,
      blockedReason: readyForIssueDraft
        ? null
        : "needs feedback carrying at least two distinct pseudonymous session IDs",
      requiresUserApproval: true,
      automaticPullRequestAllowed: false,
      nextAction: readyForIssueDraft
        ? "Reproduce against the current version, draft one evidence-linked issue, and request user approval before external creation."
        : "Collect the same signal from another pseudonymous session before drafting an issue.",
    };
  }).sort((left, right) => {
    const leftImpact = Math.min(...left.outcomes.map((outcome) => OUTCOME_IMPACT[outcome]));
    const rightImpact = Math.min(...right.outcomes.map((outcome) => OUTCOME_IMPACT[outcome]));
    return leftImpact - rightImpact
      || right.distinctSessionCount - left.distinctSessionCount
      || right.reportCount - left.reportCount
      || left.signalKey.localeCompare(right.signalKey);
  });

  const successSignals = [...new Set(reports
    .filter(({outcome}) => outcome === "success")
    .map(({signalKey}) => signalKey))].sort();
  const sessionTaggedReportCount = reports.filter(({sessionId}) => sessionId).length;

  return {
    schemaVersion: 1 as const,
    artifactType: "agent-experience-summary" as const,
    reportCount: reports.length,
    period: reports.length === 0
      ? null
      : {oldest: reports[0]!.reportedAt, newest: reports.at(-1)!.reportedAt},
    outcomeCounts: countValues(reports.map(({outcome}) => outcome), OUTCOMES),
    surfaceCounts: countValues(reports.map(({surface}) => surface), SURFACES),
    stageCounts: countValues(reports.map(({stage}) => stage), STAGES),
    wouldReuseCounts: countValues(reports.map(({wouldReuse}) => wouldReuse), REUSE),
    recommendationCounts: countValues(
      reports.map(({recommendation}) => recommendation),
      RECOMMENDATIONS,
    ),
    productVersionCounts: Object.fromEntries([...new Set(reports.map(
      ({productVersion}) => productVersion,
    ))].sort().map((version) => [
      version,
      reports.filter(({productVersion}) => productVersion === version).length,
    ])),
    sessionCoverage: {
      taggedReportCount: sessionTaggedReportCount,
      untaggedReportCount: reports.length - sessionTaggedReportCount,
      distinctSessionCount: new Set(reports.flatMap(({sessionId}) =>
        sessionId ? [sessionId] : [])).size,
    },
    issueCandidates,
    successSignals,
    limitations: [
      "Agent self-reports describe agent experience, not player experience or human satisfaction.",
      "Repeated signals are issue-draft candidates, not verified bugs or authorization to mutate GitHub.",
      "Session IDs are caller-provided; distinct IDs do not prove independent agents or users.",
      "No tool-call telemetry is collected unless an agent explicitly submits this feedback tool.",
    ],
  };
}

export interface AgentExperienceFeedbackService {
  report(input: AgentExperienceFeedbackInput): Promise<{
    record: AgentExperienceFeedbackRecord;
    artifact: IntelArtifactMetadata;
    externalTransmission: false;
  }>;
  summarize(input?: AgentExperienceSummaryInput): Promise<{
    data: ReturnType<typeof buildAgentExperienceSummary> & {
      availableArtifactCount: number;
      inspectedArtifactCount: number;
      matchedArtifactCount: number;
      excludedInvalidArtifactCount: number;
      truncated: boolean;
      query: z.output<typeof AgentExperienceSummaryInputSchema>;
    };
    warnings: string[];
  }>;
}

export function createAgentExperienceFeedbackService(
  artifactStore: Pick<ArtifactStore, "saveIntel" | "listArtifacts" | "readIntel">,
  dependencies: AgentExperienceRecordDependencies,
): AgentExperienceFeedbackService {
  return {
    async report(input) {
      const record = createAgentExperienceFeedbackRecord(input, dependencies);
      const artifact = await artifactStore.saveIntel({
        target: AGENT_EXPERIENCE_TARGET,
        id: `feedback-${record.feedbackId}`,
        sourceTool: "report_agent_experience",
        observedAt: record.reportedAt,
        payload: record,
      });
      return {record, artifact, externalTransmission: false};
    },

    async summarize(input = {}) {
      const query = AgentExperienceSummaryInputSchema.parse(input);
      const artifacts = (await artifactStore.listArtifacts("intel", AGENT_EXPERIENCE_TARGET))
        .filter(({sourceTool}) => sourceTool === "report_agent_experience")
        .sort((left, right) =>
          right.observedAt.localeCompare(left.observedAt) || right.id.localeCompare(left.id));
      const matched: AgentExperienceFeedbackRecord[] = [];
      let excludedInvalidArtifactCount = 0;
      for (const metadata of artifacts) {
        const stored = await artifactStore.readIntel(AGENT_EXPERIENCE_TARGET, metadata.id);
        const record = AgentExperienceFeedbackRecordSchema.safeParse(stored.payload);
        if (!record.success) {
          excludedInvalidArtifactCount += 1;
          continue;
        }
        if (query.surface && record.data.surface !== query.surface) continue;
        if (query.outcome && record.data.outcome !== query.outcome) continue;
        if (query.productVersion && record.data.productVersion !== query.productVersion) continue;
        matched.push(record.data);
      }
      const selected = matched.slice(0, query.limit);
      return {
        data: {
          ...buildAgentExperienceSummary(selected),
          availableArtifactCount: artifacts.length,
          inspectedArtifactCount: artifacts.length,
          matchedArtifactCount: matched.length,
          excludedInvalidArtifactCount,
          truncated: matched.length > selected.length,
          query,
        },
        warnings: excludedInvalidArtifactCount > 0
          ? [`${excludedInvalidArtifactCount} invalid agent feedback artifact(s) were excluded`]
          : [],
      };
    },
  };
}
