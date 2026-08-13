import {z} from "zod";
import {addSafeSchemaIssues, RevisionIdSchema} from "./prompt-validation.js";

const EMAIL_LIKE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const ManualTestTextSchema = z.string().trim().min(1).max(2_000).refine(
  (value) => !EMAIL_LIKE_PATTERN.test(value),
  "manual test text must not contain email addresses",
);
const ManualTestQuestionSchema = z.string().trim().min(1).max(1_000).refine(
  (value) => !EMAIL_LIKE_PATTERN.test(value),
  "manual test questions must not contain email addresses",
);
const PseudonymousParticipantIdSchema = z.string().trim().regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  "participantId must be a pseudonymous identifier",
);
const TargetFitSchema = z.enum(["high", "medium", "low", "unknown"]);
const UnderstandingSchema = z.enum(["yes", "no", "unclear", "not-measured"]);
const InterestSchema = z.enum(["would-play", "maybe", "would-not-play", "not-asked"]);
const ImmediateRejectSchema = z.enum(["yes", "no", "unclear", "not-asked"]);
const RevisionVariableSchema = z.enum([
  "theme",
  "system",
  "experience",
  "reward",
  "presentation",
]);

const RevisionDesignShape = {
  changeSummary: ManualTestTextSchema.optional(),
  changedVariables: z.array(RevisionVariableSchema).min(1).max(5).optional(),
  invariantsKept: z.array(ManualTestTextSchema).min(1).max(20).optional(),
};

interface RevisionDesign {
  parentId?: string;
  currentId: string;
  changeSummary?: string;
  changedVariables?: string[];
  invariantsKept?: string[];
}

function validateRevisionDesign(
  value: RevisionDesign,
  context: z.RefinementCtx,
  parentField: "parentStimulusId" | "parentAssetId",
): void {
  const hasDesignFields = value.changeSummary !== undefined
    || value.changedVariables !== undefined
    || value.invariantsKept !== undefined;
  if (!value.parentId && hasDesignFields) {
    context.addIssue({
      code: "custom",
      path: [parentField],
      message: `${parentField} is required when revision design fields are provided`,
    });
  }
  if (value.parentId) {
    if (!value.changeSummary) {
      context.addIssue({
        code: "custom",
        path: ["changeSummary"],
        message: `changeSummary is required when ${parentField} is provided`,
      });
    }
    if (!value.changedVariables) {
      context.addIssue({
        code: "custom",
        path: ["changedVariables"],
        message: `changedVariables is required when ${parentField} is provided`,
      });
    }
    if (!value.invariantsKept) {
      context.addIssue({
        code: "custom",
        path: ["invariantsKept"],
        message: `invariantsKept is required when ${parentField} is provided`,
      });
    }
  }
  if (value.parentId === value.currentId) {
    context.addIssue({
      code: "custom",
      path: [parentField],
      message: `${parentField} must differ from the current revision ID`,
    });
  }
  if (value.changedVariables
    && new Set(value.changedVariables).size !== value.changedVariables.length) {
    context.addIssue({
      code: "custom",
      path: ["changedVariables"],
      message: "changedVariables must not contain duplicates",
    });
  }
}

function validateUniqueParticipants(
  participants: readonly {participantId: string}[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, participant] of participants.entries()) {
    if (seen.has(participant.participantId)) {
      context.addIssue({
        code: "custom",
        path: ["participants", index, "participantId"],
        message: "participantId values must be unique",
      });
    }
    seen.add(participant.participantId);
  }
}

const ConceptTestParticipantSchema = z.object({
  participantId: PseudonymousParticipantIdSchema,
  targetFit: TargetFitSchema,
  understoodAction: UnderstandingSchema,
  understoodReward: UnderstandingSchema,
  interest: InterestSchema,
  unaidedSummary: ManualTestTextSchema.optional(),
  confusions: z.array(ManualTestTextSchema).max(20),
}).strict();

export const ConceptTestObjectSchema = z.object({
  testedAt: z.iso.datetime({offset: true}),
  stimulusId: RevisionIdSchema,
  parentStimulusId: RevisionIdSchema.optional(),
  ...RevisionDesignShape,
  projectBriefRevision: RevisionIdSchema.optional(),
  promiseShown: ManualTestTextSchema,
  stimulusDescription: ManualTestTextSchema,
  exposureProtocol: ManualTestTextSchema,
  recruitment: ManualTestTextSchema,
  targetPlayerDefinition: ManualTestTextSchema,
  questionsAsked: z.array(ManualTestQuestionSchema).min(1).max(10),
  participants: z.array(ConceptTestParticipantSchema).min(1).max(50),
  deviations: z.array(ManualTestTextSchema).max(20).optional(),
}).strict().superRefine((value, context) => {
  validateRevisionDesign({
    parentId: value.parentStimulusId,
    currentId: value.stimulusId,
    changeSummary: value.changeSummary,
    changedVariables: value.changedVariables,
    invariantsKept: value.invariantsKept,
  }, context, "parentStimulusId");
  validateUniqueParticipants(value.participants, context);
});

export type ConceptTest = z.infer<typeof ConceptTestObjectSchema>;

const CONCEPT_TEST_SAFE_FIELDS = new Set<string>([
  "testedAt", "stimulusId", "parentStimulusId", "changeSummary",
  "changedVariables", "invariantsKept", "projectBriefRevision", "promiseShown",
  "stimulusDescription", "exposureProtocol", "recruitment",
  "targetPlayerDefinition", "questionsAsked", "participants", "deviations",
  "participantId", "targetFit", "understoodAction", "understoodReward",
  "interest", "unaidedSummary", "confusions",
]);

export const ConceptTestSchema = createJsonStringSchema(
  "conceptTest",
  50_000,
  ConceptTestObjectSchema,
  CONCEPT_TEST_SAFE_FIELDS,
);

const FirstContactAssetTypeSchema = z.enum([
  "capsule", "key-visual", "store-viewport", "screenshots", "trailer",
  "microtrailer", "demo-entry", "other",
]);

const FirstContactExposureContextSchema = z.object({
  device: ManualTestTextSchema,
  viewport: ManualTestTextSchema.optional(),
  durationSeconds: z.number().finite().positive().max(3_600).optional(),
  sound: z.enum(["on", "off", "not-applicable", "unknown"]),
  orderDescription: ManualTestTextSchema,
}).strict();

const FirstContactParticipantSchema = z.object({
  participantId: PseudonymousParticipantIdSchema,
  targetFit: TargetFitSchema,
  understoodTheme: UnderstandingSchema,
  understoodAction: UnderstandingSchema,
  understoodReward: UnderstandingSchema,
  immediateReject: ImmediateRejectSchema,
  unaidedSummary: ManualTestTextSchema.optional(),
  rejectionReason: ManualTestTextSchema.optional(),
  confusions: z.array(ManualTestTextSchema).max(20),
}).strict();

export const FirstContactTestObjectSchema = z.object({
  testedAt: z.iso.datetime({offset: true}),
  assetId: RevisionIdSchema,
  parentAssetId: RevisionIdSchema.optional(),
  ...RevisionDesignShape,
  assetType: FirstContactAssetTypeSchema,
  assetDescription: ManualTestTextSchema,
  exposureContext: FirstContactExposureContextSchema,
  recruitment: ManualTestTextSchema,
  targetPlayerDefinition: ManualTestTextSchema,
  questionsAsked: z.array(ManualTestQuestionSchema).min(1).max(10),
  participants: z.array(FirstContactParticipantSchema).min(1).max(50),
  deviations: z.array(ManualTestTextSchema).max(20).optional(),
}).strict().superRefine((value, context) => {
  validateRevisionDesign({
    parentId: value.parentAssetId,
    currentId: value.assetId,
    changeSummary: value.changeSummary,
    changedVariables: value.changedVariables,
    invariantsKept: value.invariantsKept,
  }, context, "parentAssetId");
  validateUniqueParticipants(value.participants, context);
});

export type FirstContactTest = z.infer<typeof FirstContactTestObjectSchema>;

const FIRST_CONTACT_TEST_SAFE_FIELDS = new Set<string>([
  "testedAt", "assetId", "parentAssetId", "changeSummary", "changedVariables",
  "invariantsKept", "assetType", "assetDescription", "exposureContext", "device",
  "viewport", "durationSeconds", "sound", "orderDescription", "recruitment",
  "targetPlayerDefinition", "questionsAsked", "participants", "deviations",
  "participantId", "targetFit", "understoodTheme", "understoodAction",
  "understoodReward", "immediateReject", "unaidedSummary", "rejectionReason",
  "confusions",
]);

export const FirstContactTestSchema = createJsonStringSchema(
  "firstContactTest",
  50_000,
  FirstContactTestObjectSchema,
  FIRST_CONTACT_TEST_SAFE_FIELDS,
);

function createJsonStringSchema<T extends z.ZodType>(
  root: string,
  maxBytes: number,
  objectSchema: T,
  safeFields: ReadonlySet<string>,
) {
  return z.string().trim().min(2).max(maxBytes).transform((input, context) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      context.addIssue({code: "custom", message: `${root} must be valid JSON`});
      return z.NEVER;
    }
    const result = objectSchema.safeParse(parsed);
    if (!result.success) {
      addSafeSchemaIssues(context, root, result.error.issues, safeFields);
      return z.NEVER;
    }
    return JSON.stringify(result.data);
  });
}

function countValues<T extends string>(values: readonly T[], order: readonly T[]) {
  return Object.fromEntries(order.map((value) => [
    value,
    values.filter((candidate) => candidate === value).length,
  ]));
}

function buildRevisionDesignDiagnostics(
  parentId: string | undefined,
  changedVariables: string[] | undefined,
  invariantsKept: string[] | undefined,
) {
  const multipleChanges = (changedVariables?.length ?? 0) > 1;
  return {
    changedVariables: changedVariables ?? [],
    invariantsDeclaredCount: invariantsKept?.length ?? 0,
    causalAttributionStatus: !parentId
      ? "not-applicable-initial"
      : multipleChanges
        ? "unresolved-multiple-changes"
        : "comparison-candidate-only",
    candidateReviewAreas: multipleChanges ? ["multi-variable-change"] : [],
    interpretationLimit: "Declared variables and invariants support comparison planning only; they do not verify protocol equivalence or prove causality.",
  };
}

export interface ProjectBriefAlignment {
  revisionId?: string;
  oneSentencePromise?: string;
}

export function buildConceptTestDiagnostics(
  conceptTest: ConceptTest,
  projectBrief?: ProjectBriefAlignment,
) {
  const participants = conceptTest.participants;
  const actionUnderstandingCounts = countValues(
    participants.map((participant) => participant.understoodAction),
    UnderstandingSchema.options,
  );
  const rewardUnderstandingCounts = countValues(
    participants.map((participant) => participant.understoodReward),
    UnderstandingSchema.options,
  );
  const interestCounts = countValues(
    participants.map((participant) => participant.interest),
    InterestSchema.options,
  );
  const revisionStatus = !projectBrief
    ? "not-supplied"
    : !projectBrief.revisionId || !conceptTest.projectBriefRevision
      ? "unlinked"
      : projectBrief.revisionId === conceptTest.projectBriefRevision
        ? "matched"
        : "mismatched";
  const promiseStatus = !projectBrief
    ? "not-supplied"
    : !projectBrief.oneSentencePromise
      ? "unlinked"
      : projectBrief.oneSentencePromise === conceptTest.promiseShown
        ? "matched"
        : "mismatched";
  const unaidedSummaryCount = participants.filter(
    (participant) => participant.unaidedSummary !== undefined,
  ).length;
  const confusionNoteCount = participants.reduce(
    (total, participant) => total + participant.confusions.length,
    0,
  );
  const deviationCount = conceptTest.deviations?.length ?? 0;
  const revisionDesign = buildRevisionDesignDiagnostics(
    conceptTest.parentStimulusId,
    conceptTest.changedVariables,
    conceptTest.invariantsKept,
  );
  const candidateReviewAreas = [
    ...([revisionStatus, promiseStatus].some(
      (status) => status === "mismatched" || status === "unlinked",
    ) ? ["stimulus-provenance"] : []),
    ...revisionDesign.candidateReviewAreas,
    ...(deviationCount > 0 ? ["protocol-deviation"] : []),
    ...(actionUnderstandingCounts["not-measured"] > 0
      || rewardUnderstandingCounts["not-measured"] > 0
      || interestCounts["not-asked"] > 0
      || unaidedSummaryCount < participants.length
      ? ["measurement-coverage"] : []),
    ...(actionUnderstandingCounts.no > 0 || actionUnderstandingCounts.unclear > 0
      ? ["action-legibility"] : []),
    ...(rewardUnderstandingCounts.no > 0 || rewardUnderstandingCounts.unclear > 0
      ? ["reward-legibility"] : []),
    ...(confusionNoteCount > 0 ? ["reported-confusions"] : []),
    ...(interestCounts["would-not-play"] > 0 ? ["interest-follow-up"] : []),
  ];
  return {
    status: "descriptive-only",
    participantCount: participants.length,
    targetFitCounts: countValues(
      participants.map((participant) => participant.targetFit),
      TargetFitSchema.options,
    ),
    actionUnderstandingCounts,
    rewardUnderstandingCounts,
    interestCounts,
    unaidedSummaryCount,
    confusionNoteCount,
    deviationCount,
    briefAlignment: {
      revisionStatus,
      promiseStatus,
      interpretationLimit: "Exact matches establish provenance only; they do not score comprehension, appeal, or brief quality.",
    },
    revisionLoop: {
      status: conceptTest.parentStimulusId ? "linked-revision" : "initial-stimulus",
      ...(conceptTest.parentStimulusId
        ? {parentStimulusId: conceptTest.parentStimulusId}
        : {}),
      changeSummaryDeclared: conceptTest.changeSummary !== undefined,
      changedVariables: revisionDesign.changedVariables,
      invariantsDeclaredCount: revisionDesign.invariantsDeclaredCount,
      causalAttributionStatus: revisionDesign.causalAttributionStatus,
      candidateReviewAreas,
      nextAction: candidateReviewAreas.length > 0
        ? "Treat these as inspection priorities, not causes. If revising, change one core or asset variable, assign a new stimulusId, link parentStimulusId, and retest under a comparable protocol."
        : "No bounded issue signal was recorded; seek gameplay and first-contact asset evidence before making a broader claim.",
      interpretationLimit: "Signals prioritize inspection only; they neither require a revision nor establish which change caused a later result.",
      comparisonInterpretationLimit: revisionDesign.interpretationLimit,
    },
    interpretationLimit: "Counts describe this bounded sample only; they are not population rates, purchase forecasts, or fixed pass thresholds.",
  };
}

export function buildFirstContactTestDiagnostics(firstContactTest: FirstContactTest) {
  const participants = firstContactTest.participants;
  const themeLegibilityCounts = countValues(
    participants.map((participant) => participant.understoodTheme),
    UnderstandingSchema.options,
  );
  const actionLegibilityCounts = countValues(
    participants.map((participant) => participant.understoodAction),
    UnderstandingSchema.options,
  );
  const rewardLegibilityCounts = countValues(
    participants.map((participant) => participant.understoodReward),
    UnderstandingSchema.options,
  );
  const immediateRejectCounts = countValues(
    participants.map((participant) => participant.immediateReject),
    ImmediateRejectSchema.options,
  );
  const unaidedSummaryCount = participants.filter(
    (participant) => participant.unaidedSummary !== undefined,
  ).length;
  const rejectionReasonCount = participants.filter(
    (participant) => participant.rejectionReason !== undefined,
  ).length;
  const unexplainedImmediateRejectCount = participants.filter(
    (participant) => participant.immediateReject === "yes"
      && participant.rejectionReason === undefined,
  ).length;
  const confusionNoteCount = participants.reduce(
    (total, participant) => total + participant.confusions.length,
    0,
  );
  const deviationCount = firstContactTest.deviations?.length ?? 0;
  const revisionDesign = buildRevisionDesignDiagnostics(
    firstContactTest.parentAssetId,
    firstContactTest.changedVariables,
    firstContactTest.invariantsKept,
  );
  const candidateReviewAreas = [
    ...revisionDesign.candidateReviewAreas,
    ...(deviationCount > 0 ? ["protocol-deviation"] : []),
    ...(themeLegibilityCounts["not-measured"] > 0
      || actionLegibilityCounts["not-measured"] > 0
      || rewardLegibilityCounts["not-measured"] > 0
      || immediateRejectCounts["not-asked"] > 0
      || unaidedSummaryCount < participants.length
      ? ["measurement-coverage"] : []),
    ...(themeLegibilityCounts.no > 0 || themeLegibilityCounts.unclear > 0
      ? ["theme-legibility"] : []),
    ...(actionLegibilityCounts.no > 0 || actionLegibilityCounts.unclear > 0
      ? ["action-legibility"] : []),
    ...(rewardLegibilityCounts.no > 0 || rewardLegibilityCounts.unclear > 0
      ? ["reward-legibility"] : []),
    ...(immediateRejectCounts.yes > 0 ? ["immediate-reject"] : []),
    ...(unexplainedImmediateRejectCount > 0 ? ["rejection-reason-coverage"] : []),
    ...(confusionNoteCount > 0 ? ["reported-confusions"] : []),
  ];
  return {
    status: "descriptive-only",
    assetType: firstContactTest.assetType,
    participantCount: participants.length,
    targetFitCounts: countValues(
      participants.map((participant) => participant.targetFit),
      TargetFitSchema.options,
    ),
    themeLegibilityCounts,
    actionLegibilityCounts,
    rewardLegibilityCounts,
    immediateRejectCounts,
    unaidedSummaryCount,
    rejectionReasonCount,
    unexplainedImmediateRejectCount,
    confusionNoteCount,
    deviationCount,
    revisionLoop: {
      status: firstContactTest.parentAssetId ? "linked-revision" : "initial-asset",
      ...(firstContactTest.parentAssetId
        ? {parentAssetId: firstContactTest.parentAssetId}
        : {}),
      changeSummaryDeclared: firstContactTest.changeSummary !== undefined,
      changedVariables: revisionDesign.changedVariables,
      invariantsDeclaredCount: revisionDesign.invariantsDeclaredCount,
      causalAttributionStatus: revisionDesign.causalAttributionStatus,
      candidateReviewAreas,
      nextAction: candidateReviewAreas.length > 0
        ? "Treat these as inspection priorities, not causes. Revise one asset variable and retest in the same real display context when comparison is needed."
        : "No bounded issue signal was recorded; connect the promise to gameplay evidence before making a broader readiness claim.",
      interpretationLimit: revisionDesign.interpretationLimit,
    },
    rejectionReasonInterpretationLimit: "Missing immediate-reject reasons must not be inferred from other fields or participant responses.",
    interpretationLimit: "Counts describe this bounded sample and exposure context only; they do not establish fun, demand, conversion, or storefront readiness.",
  };
}
