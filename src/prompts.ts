import {z} from "zod";

const DOMAIN_ORDER = [
  "gameplay",
  "storefront",
  "ui",
  "price",
  "localization",
  "competition",
] as const;
const DOMAIN_VALUES = new Set<string>(DOMAIN_ORDER);

const NonEmptyTrimmedStringSchema = z.string().trim().min(1);

const DomainsSchema = z.string().transform((input, context) => {
  const domains = input.split(",").map((domain) => domain.trim()).filter(Boolean);
  const unknown = domains.filter((domain) => domain !== "auto" && !DOMAIN_VALUES.has(domain));
  if (domains.length === 0 || unknown.length > 0) {
    context.addIssue({
      code: "custom",
      message: unknown.length > 0
        ? `Unknown domains: ${[...new Set(unknown)].join(", ")}`
        : "At least one domain is required",
    });
    return z.NEVER;
  }
  if (domains.includes("auto")) {
    if (domains.some((domain) => domain !== "auto")) {
      context.addIssue({
        code: "custom",
        message: "auto cannot be mixed with explicit domains",
      });
      return z.NEVER;
    }
    return "auto";
  }

  const selected = new Set(domains);
  return DOMAIN_ORDER.filter((domain) => selected.has(domain)).join(",");
});

const ReferenceImageIdsSchema = z.string().transform((input, context) => {
  const imageIds = [...new Set(
    input.split(",").map((imageId) => imageId.trim()).filter(Boolean),
  )];
  if (imageIds.length === 0) {
    context.addIssue({code: "custom", message: "At least one reference image ID is required"});
    return z.NEVER;
  }
  return imageIds.join(",");
});

const UiReferenceUrlsSchema = z.string().max(8_192).transform((input, context) => {
  const candidates = [...new Set(
    input.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean),
  )];
  if (candidates.length === 0) {
    context.addIssue({code: "custom", message: "At least one UI reference URL is required"});
    return z.NEVER;
  }
  const normalized: string[] = [];
  for (const [index, candidate] of candidates.entries()) {
    try {
      const parsed = new URL(candidate);
      if (
        parsed.protocol !== "https:"
        || parsed.hostname === ""
        || parsed.username !== ""
        || parsed.password !== ""
      ) {
        throw new Error("UI reference URLs must be credential-free HTTPS URLs");
      }
      parsed.hash = "";
      normalized.push(parsed.href);
    } catch {
      context.addIssue({
        code: "custom",
        message: `Invalid UI reference URL at position ${index + 1}`,
      });
      return z.NEVER;
    }
  }
  const unique = [...new Set(normalized)];
  if (unique.length > 8) {
    context.addIssue({code: "custom", message: "At most eight UI reference URLs are allowed"});
    return z.NEVER;
  }
  return unique.join("\n");
});

const PlaytestUrlSchema = z.string().trim().max(2_048).transform((input, context) => {
  try {
    const parsed = new URL(input);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.hostname === ""
      || parsed.username !== ""
      || parsed.password !== ""
    ) {
      throw new Error("invalid playtest URL");
    }
    return parsed.href;
  } catch {
    context.addIssue({
      code: "custom",
      message: "playtestUrl must be a credential-free HTTP(S) URL",
    });
    return z.NEVER;
  }
});

const PlaytestDurationSchema = z.string().trim().regex(/^\d{1,3}$/).refine(
  (value) => Number(value) >= 1 && Number(value) <= 120,
  "playtestDurationMinutes must be between 1 and 120",
);

const ProjectBriefTextSchema = z.string().trim().min(1).max(2_000);
const RevisionIdSchema = z.string().trim().min(1).max(200).regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/,
);
const ProjectBriefObjectSchema = z.object({
  revisionId: RevisionIdSchema.optional(),
  developmentStage: z.enum([
    "concept",
    "prototype",
    "vertical-slice",
    "store-live",
    "demo",
    "prelaunch",
    "launched",
  ]).optional(),
  decisionHorizon: ProjectBriefTextSchema.optional(),
  targetPlayer: ProjectBriefTextSchema.optional(),
  themeWorld: ProjectBriefTextSchema.optional(),
  distinctiveSystem: ProjectBriefTextSchema.optional(),
  repeatedAction: ProjectBriefTextSchema.optional(),
  playerDecision: ProjectBriefTextSchema.optional(),
  systemResponse: ProjectBriefTextSchema.optional(),
  immediateReward: ProjectBriefTextSchema.optional(),
  transitionReward: ProjectBriefTextSchema.optional(),
  rewardAmplifier: ProjectBriefTextSchema.optional(),
  oneSentencePromise: ProjectBriefTextSchema.optional(),
  knownFrame: ProjectBriefTextSchema.optional(),
  meaningfulDifference: ProjectBriefTextSchema.optional(),
  teamCapacity: ProjectBriefTextSchema.optional(),
  runwayMonths: z.number().finite().min(0).max(600).optional(),
  nextIrreversibleCommitment: ProjectBriefTextSchema.optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  "projectBrief must contain at least one supported field",
);

type ProjectBrief = z.infer<typeof ProjectBriefObjectSchema>;
type ProjectBriefField = keyof ProjectBrief;

const PROJECT_BRIEF_FIELD_GROUPS = {
  coreExperience: [
    "targetPlayer",
    "themeWorld",
    "distinctiveSystem",
    "repeatedAction",
    "playerDecision",
    "systemResponse",
    "immediateReward",
    "transitionReward",
    "rewardAmplifier",
    "oneSentencePromise",
  ],
  differentiation: ["knownFrame", "meaningfulDifference"],
  decisionContext: [
    "revisionId",
    "developmentStage",
    "decisionHorizon",
    "teamCapacity",
    "runwayMonths",
    "nextIrreversibleCommitment",
  ],
} as const satisfies Record<string, readonly ProjectBriefField[]>;

function buildProjectBriefDiagnostics(projectBrief: ProjectBrief) {
  const groupDiagnostics = Object.fromEntries(
    Object.entries(PROJECT_BRIEF_FIELD_GROUPS).map(([group, fields]) => {
      const missingFields = fields.filter((field) => projectBrief[field] === undefined);
      return [group, {
        declaredCount: fields.length - missingFields.length,
        totalFields: fields.length,
        missingFields,
      }];
    }),
  );
  const allFields = Object.values(PROJECT_BRIEF_FIELD_GROUPS).flat();

  return {
    status: "inventory-only",
    declaredFields: allFields.filter((field) => projectBrief[field] !== undefined),
    groups: groupDiagnostics,
    interpretationLimit: "Field presence is not a quality score, evidence result, or milestone pass.",
  };
}

const PROJECT_BRIEF_SAFE_FIELDS = new Set<string>([
  ...Object.values(PROJECT_BRIEF_FIELD_GROUPS).flat(),
]);

function safeIssuePath(
  path: readonly PropertyKey[],
  allowedFields: ReadonlySet<string>,
): string | undefined {
  let rendered = "";
  for (const segment of path) {
    if (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0) {
      rendered += `[${segment}]`;
      continue;
    }
    if (typeof segment !== "string" || !allowedFields.has(segment)) return undefined;
    rendered += rendered === "" ? segment : `.${segment}`;
  }
  return rendered || undefined;
}

function safeSchemaIssueMessage(
  root: string,
  issue: {code: string; path: readonly PropertyKey[]},
  allowedFields: ReadonlySet<string>,
): string {
  const path = safeIssuePath(issue.path, allowedFields);
  const subject = path ? `${root}.${path}` : root;
  switch (issue.code) {
    case "unrecognized_keys": return `${subject} contains an unsupported field`;
    case "invalid_type": return `${subject} has the wrong type`;
    case "invalid_value": return `${subject} must use a supported value`;
    case "too_small": return `${subject} is below the allowed minimum`;
    case "too_big": return `${subject} exceeds the allowed maximum`;
    case "invalid_format": return `${subject} has an invalid format`;
    case "not_multiple_of": return `${subject} has an invalid numeric increment`;
    default: return `${subject} is invalid`;
  }
}

function addSafeSchemaIssues(
  context: z.RefinementCtx,
  root: string,
  issues: readonly {code: string; path: readonly PropertyKey[]}[],
  allowedFields: ReadonlySet<string>,
): void {
  const messages = new Set(
    issues.map((issue) => safeSchemaIssueMessage(root, issue, allowedFields)),
  );
  for (const message of [...messages].slice(0, 8)) {
    context.addIssue({code: "custom", message});
  }
}

const ProjectBriefSchema = z.string().trim().min(2).max(20_000).transform(
  (input, context) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      context.addIssue({
        code: "custom",
        message: "projectBrief must be valid JSON",
      });
      return z.NEVER;
    }
    const result = ProjectBriefObjectSchema.safeParse(parsed);
    if (!result.success) {
      addSafeSchemaIssues(
        context,
        "projectBrief",
        result.error.issues,
        PROJECT_BRIEF_SAFE_FIELDS,
      );
      return z.NEVER;
    }
    return JSON.stringify(result.data);
  },
);

const EMAIL_LIKE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const ConceptTestTextSchema = z.string().trim().min(1).max(2_000).refine(
  (value) => !EMAIL_LIKE_PATTERN.test(value),
  "concept test text must not contain email addresses",
);
const ConceptTestQuestionSchema = z.string().trim().min(1).max(1_000).refine(
  (value) => !EMAIL_LIKE_PATTERN.test(value),
  "concept test questions must not contain email addresses",
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

const ConceptTestParticipantSchema = z.object({
  participantId: PseudonymousParticipantIdSchema,
  targetFit: TargetFitSchema,
  understoodAction: UnderstandingSchema,
  understoodReward: UnderstandingSchema,
  interest: InterestSchema,
  unaidedSummary: ConceptTestTextSchema.optional(),
  confusions: z.array(ConceptTestTextSchema).max(20),
}).strict();

const ConceptTestObjectSchema = z.object({
  testedAt: z.iso.datetime({offset: true}),
  stimulusId: RevisionIdSchema,
  parentStimulusId: RevisionIdSchema.optional(),
  changeSummary: ConceptTestTextSchema.optional(),
  changedVariables: z.array(RevisionVariableSchema).min(1).max(5).optional(),
  invariantsKept: z.array(ConceptTestTextSchema).min(1).max(20).optional(),
  projectBriefRevision: RevisionIdSchema.optional(),
  promiseShown: ConceptTestTextSchema,
  stimulusDescription: ConceptTestTextSchema,
  exposureProtocol: ConceptTestTextSchema,
  recruitment: ConceptTestTextSchema,
  targetPlayerDefinition: ConceptTestTextSchema,
  questionsAsked: z.array(ConceptTestQuestionSchema).min(1).max(10),
  participants: z.array(ConceptTestParticipantSchema).min(1).max(50),
  deviations: z.array(ConceptTestTextSchema).max(20).optional(),
}).strict().superRefine((value, context) => {
  if (value.parentStimulusId && !value.changeSummary) {
    context.addIssue({
      code: "custom",
      path: ["changeSummary"],
      message: "changeSummary is required when parentStimulusId is provided",
    });
  }
  if (value.changeSummary && !value.parentStimulusId) {
    context.addIssue({
      code: "custom",
      path: ["parentStimulusId"],
      message: "parentStimulusId is required when changeSummary is provided",
    });
  }
  if ((value.changedVariables || value.invariantsKept) && !value.parentStimulusId) {
    context.addIssue({
      code: "custom",
      path: ["parentStimulusId"],
      message: "parentStimulusId is required when revision design fields are provided",
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
  if (value.parentStimulusId === value.stimulusId) {
    context.addIssue({
      code: "custom",
      path: ["parentStimulusId"],
      message: "parentStimulusId must differ from stimulusId",
    });
  }
  const seen = new Set<string>();
  for (const [index, participant] of value.participants.entries()) {
    if (seen.has(participant.participantId)) {
      context.addIssue({
        code: "custom",
        path: ["participants", index, "participantId"],
        message: "participantId values must be unique",
      });
    }
    seen.add(participant.participantId);
  }
});

type ConceptTest = z.infer<typeof ConceptTestObjectSchema>;

const CONCEPT_TEST_SAFE_FIELDS = new Set<string>([
  "testedAt",
  "stimulusId",
  "parentStimulusId",
  "changeSummary",
  "changedVariables",
  "invariantsKept",
  "projectBriefRevision",
  "promiseShown",
  "stimulusDescription",
  "exposureProtocol",
  "recruitment",
  "targetPlayerDefinition",
  "questionsAsked",
  "participants",
  "deviations",
  "participantId",
  "targetFit",
  "understoodAction",
  "understoodReward",
  "interest",
  "unaidedSummary",
  "confusions",
]);

const ConceptTestSchema = z.string().trim().min(2).max(50_000).transform(
  (input, context) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      context.addIssue({
        code: "custom",
        message: "conceptTest must be valid JSON",
      });
      return z.NEVER;
    }
    const result = ConceptTestObjectSchema.safeParse(parsed);
    if (!result.success) {
      addSafeSchemaIssues(
        context,
        "conceptTest",
        result.error.issues,
        CONCEPT_TEST_SAFE_FIELDS,
      );
      return z.NEVER;
    }
    return JSON.stringify(result.data);
  },
);

const FirstContactAssetTypeSchema = z.enum([
  "capsule",
  "key-visual",
  "store-viewport",
  "screenshots",
  "trailer",
  "microtrailer",
  "demo-entry",
  "other",
]);

const FirstContactExposureContextSchema = z.object({
  device: ConceptTestTextSchema,
  viewport: ConceptTestTextSchema.optional(),
  durationSeconds: z.number().finite().positive().max(3_600).optional(),
  sound: z.enum(["on", "off", "not-applicable", "unknown"]),
  orderDescription: ConceptTestTextSchema,
}).strict();

const FirstContactParticipantSchema = z.object({
  participantId: PseudonymousParticipantIdSchema,
  targetFit: TargetFitSchema,
  understoodTheme: UnderstandingSchema,
  understoodAction: UnderstandingSchema,
  understoodReward: UnderstandingSchema,
  immediateReject: ImmediateRejectSchema,
  unaidedSummary: ConceptTestTextSchema.optional(),
  rejectionReason: ConceptTestTextSchema.optional(),
  confusions: z.array(ConceptTestTextSchema).max(20),
}).strict();

const FirstContactTestObjectSchema = z.object({
  testedAt: z.iso.datetime({offset: true}),
  assetId: RevisionIdSchema,
  parentAssetId: RevisionIdSchema.optional(),
  changeSummary: ConceptTestTextSchema.optional(),
  changedVariables: z.array(RevisionVariableSchema).min(1).max(5).optional(),
  invariantsKept: z.array(ConceptTestTextSchema).min(1).max(20).optional(),
  assetType: FirstContactAssetTypeSchema,
  assetDescription: ConceptTestTextSchema,
  exposureContext: FirstContactExposureContextSchema,
  recruitment: ConceptTestTextSchema,
  targetPlayerDefinition: ConceptTestTextSchema,
  questionsAsked: z.array(ConceptTestQuestionSchema).min(1).max(10),
  participants: z.array(FirstContactParticipantSchema).min(1).max(50),
  deviations: z.array(ConceptTestTextSchema).max(20).optional(),
}).strict().superRefine((value, context) => {
  if (value.parentAssetId && !value.changeSummary) {
    context.addIssue({
      code: "custom",
      path: ["changeSummary"],
      message: "changeSummary is required when parentAssetId is provided",
    });
  }
  if (value.changeSummary && !value.parentAssetId) {
    context.addIssue({
      code: "custom",
      path: ["parentAssetId"],
      message: "parentAssetId is required when changeSummary is provided",
    });
  }
  if ((value.changedVariables || value.invariantsKept) && !value.parentAssetId) {
    context.addIssue({
      code: "custom",
      path: ["parentAssetId"],
      message: "parentAssetId is required when revision design fields are provided",
    });
  }
  if (value.parentAssetId === value.assetId) {
    context.addIssue({
      code: "custom",
      path: ["parentAssetId"],
      message: "parentAssetId must differ from assetId",
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
  const seen = new Set<string>();
  for (const [index, participant] of value.participants.entries()) {
    if (seen.has(participant.participantId)) {
      context.addIssue({
        code: "custom",
        path: ["participants", index, "participantId"],
        message: "participantId values must be unique",
      });
    }
    seen.add(participant.participantId);
  }
});

type FirstContactTest = z.infer<typeof FirstContactTestObjectSchema>;

const FIRST_CONTACT_TEST_SAFE_FIELDS = new Set<string>([
  "testedAt",
  "assetId",
  "parentAssetId",
  "changeSummary",
  "changedVariables",
  "invariantsKept",
  "assetType",
  "assetDescription",
  "exposureContext",
  "device",
  "viewport",
  "durationSeconds",
  "sound",
  "orderDescription",
  "recruitment",
  "targetPlayerDefinition",
  "questionsAsked",
  "participants",
  "deviations",
  "participantId",
  "targetFit",
  "understoodTheme",
  "understoodAction",
  "understoodReward",
  "immediateReject",
  "unaidedSummary",
  "rejectionReason",
  "confusions",
]);

const FirstContactTestSchema = z.string().trim().min(2).max(50_000).transform(
  (input, context) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      context.addIssue({
        code: "custom",
        message: "firstContactTest must be valid JSON",
      });
      return z.NEVER;
    }
    const result = FirstContactTestObjectSchema.safeParse(parsed);
    if (!result.success) {
      addSafeSchemaIssues(
        context,
        "firstContactTest",
        result.error.issues,
        FIRST_CONTACT_TEST_SAFE_FIELDS,
      );
      return z.NEVER;
    }
    return JSON.stringify(result.data);
  },
);

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
  const revisionDesignMissing = parentId !== undefined
    && (!changedVariables || !invariantsKept);
  const multipleChanges = (changedVariables?.length ?? 0) > 1;
  return {
    changedVariables: changedVariables ?? [],
    invariantsDeclaredCount: invariantsKept?.length ?? 0,
    causalAttributionStatus: !parentId
      ? "not-applicable-initial"
      : revisionDesignMissing
        ? "not-assessable"
        : multipleChanges
          ? "unresolved-multiple-changes"
          : "comparison-candidate-only",
    candidateReviewAreas: [
      ...(revisionDesignMissing ? ["revision-design"] : []),
      ...(multipleChanges ? ["multi-variable-change"] : []),
    ],
    interpretationLimit: "Declared variables and invariants support comparison planning only; they do not verify protocol equivalence or prove causality.",
  };
}

function buildConceptTestDiagnostics(
  conceptTest: ConceptTest,
  projectBrief?: ProjectBrief,
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
    ...([revisionStatus, promiseStatus].some((status) => status === "mismatched" || status === "unlinked")
      ? ["stimulus-provenance"]
      : []),
    ...revisionDesign.candidateReviewAreas,
    ...(deviationCount > 0 ? ["protocol-deviation"] : []),
    ...(actionUnderstandingCounts["not-measured"] > 0
      || rewardUnderstandingCounts["not-measured"] > 0
      || interestCounts["not-asked"] > 0
      || unaidedSummaryCount < participants.length
      ? ["measurement-coverage"]
      : []),
    ...(actionUnderstandingCounts.no > 0 || actionUnderstandingCounts.unclear > 0
      ? ["action-legibility"]
      : []),
    ...(rewardUnderstandingCounts.no > 0 || rewardUnderstandingCounts.unclear > 0
      ? ["reward-legibility"]
      : []),
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

function buildFirstContactTestDiagnostics(firstContactTest: FirstContactTest) {
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
      ? ["measurement-coverage"]
      : []),
    ...(themeLegibilityCounts.no > 0 || themeLegibilityCounts.unclear > 0
      ? ["theme-legibility"]
      : []),
    ...(actionLegibilityCounts.no > 0 || actionLegibilityCounts.unclear > 0
      ? ["action-legibility"]
      : []),
    ...(rewardLegibilityCounts.no > 0 || rewardLegibilityCounts.unclear > 0
      ? ["reward-legibility"]
      : []),
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

export const RunSimPromptArgumentsSchema = z.object({
  target: NonEmptyTrimmedStringSchema.describe("Game or proposal to evaluate"),
  topic: NonEmptyTrimmedStringSchema.describe("Consultation topic"),
  mode: z.enum(["baseline", "change"]).default("baseline"),
  domains: DomainsSchema.default("auto"),
  specification: z.string().max(50_000).optional(),
  projectBrief: ProjectBriefSchema.optional().describe(
    "JSON object containing declared project stage, core experience, and production constraints",
  ),
  conceptTest: ConceptTestSchema.optional().describe(
    "JSON object containing a bounded, pseudonymous third-party concept comprehension test",
  ),
  firstContactTest: FirstContactTestSchema.optional().describe(
    "JSON object containing a bounded, pseudonymous first-contact asset test",
  ),
  playtestUrl: PlaytestUrlSchema.optional(),
  playtestTask: z.string().trim().min(1).max(1_000).optional(),
  playtestBuild: z.string().trim().min(1).max(200).optional(),
  playtestControls: z.string().trim().min(1).max(500).optional(),
  playtestDurationMinutes: PlaytestDurationSchema.optional(),
  uiUrl: z.string().optional(),
  uiBenchmarkTask: z.string().trim().min(1).max(500).optional(),
  uiReferenceUrls: UiReferenceUrlsSchema.optional(),
  currentState: z.string().optional(),
  proposal: z.string().optional(),
  competitors: z.string().optional(),
  market: z.string().optional(),
  language: z.string().optional(),
  qualityTier: z.string().optional(),
}).superRefine((value, context) => {
  if (value.playtestUrl && !value.playtestTask) {
    context.addIssue({
      code: "custom",
      path: ["playtestTask"],
      message: "playtestTask is required when playtestUrl is provided",
    });
  }
});

export const UiBlindComparePromptArgumentsSchema = z.object({
  targetImageId: NonEmptyTrimmedStringSchema,
  referenceImageIds: ReferenceImageIdsSchema,
  context: z.string().optional(),
  qualityTier: z.string().optional(),
});

export type RunSimPromptArguments = z.input<typeof RunSimPromptArgumentsSchema>;
export type UiBlindComparePromptArguments = z.input<typeof UiBlindComparePromptArgumentsSchema>;

export interface RunSimPromptContext {
  conceptTestEvidence?: {
    sourceTool: "manual";
    observedAt: string;
    resultHandle: string;
  };
  firstContactTestEvidence?: {
    sourceTool: "manual";
    observedAt: string;
    resultHandle: string;
  };
}

export function buildConceptTestEvidenceEnvelope(input: RunSimPromptArguments) {
  const parsed = RunSimPromptArgumentsSchema.parse(input);
  if (!parsed.conceptTest) return undefined;
  const conceptTest = ConceptTestObjectSchema.parse(JSON.parse(parsed.conceptTest));
  return {
    data: conceptTest,
    warnings: [] as string[],
    meta: {observedAt: conceptTest.testedAt},
  };
}

export function buildFirstContactTestEvidenceEnvelope(input: RunSimPromptArguments) {
  const parsed = RunSimPromptArgumentsSchema.parse(input);
  if (!parsed.firstContactTest) return undefined;
  const firstContactTest = FirstContactTestObjectSchema.parse(
    JSON.parse(parsed.firstContactTest),
  );
  return {
    data: firstContactTest,
    warnings: [] as string[],
    meta: {observedAt: firstContactTest.testedAt},
  };
}

function appendSerializedInput(recipe: string, data: Record<string, unknown>): string {
  return [
    recipe,
    "",
    "--- END REPOSITORY RECIPE ---",
    "",
    "--- BEGIN INPUT DATA (JSON) ---",
    JSON.stringify(data, null, 2),
    "--- END INPUT DATA (JSON) ---",
  ].join("\n");
}

export function buildRunSimPrompt(
  recipe: string,
  input: RunSimPromptArguments,
  context: RunSimPromptContext = {},
): string {
  const parsed = RunSimPromptArgumentsSchema.parse(input);
  const selectedDomains = parsed.domains === "auto"
    ? undefined
    : parsed.domains.split(",");
  const missingChangeInputs = parsed.mode === "change"
    ? (["currentState", "proposal"] as const).filter((field) => !parsed[field]?.trim())
    : undefined;
  const missingFields = [
    ...(!parsed.market?.trim() ? ["market"] : []),
    ...(!parsed.language?.trim() ? ["language"] : []),
    ...(missingChangeInputs ?? []),
    ...(selectedDomains?.includes("ui") && !parsed.uiBenchmarkTask?.trim()
      ? ["uiBenchmarkTask"]
      : []),
  ];
  const intakeDiagnostics = {
    status: missingFields.length === 0 ? "ready" : "needs-input",
    missingFields,
    nextAction: missingFields.length === 0
      ? "Proceed with the selected evidence workflow."
      : "Ask the user for all missing fields in one concise question before calling external evidence tools.",
  };
  const {
    conceptTest,
    firstContactTest,
    projectBrief,
    uiReferenceUrls,
    ...promptInput
  } = parsed;

  const structuredProjectBrief = projectBrief
    ? ProjectBriefObjectSchema.parse(JSON.parse(projectBrief))
    : undefined;
  const structuredConceptTest = conceptTest
    ? ConceptTestObjectSchema.parse(JSON.parse(conceptTest))
    : undefined;
  const structuredFirstContactTest = firstContactTest
    ? FirstContactTestObjectSchema.parse(JSON.parse(firstContactTest))
    : undefined;

  return appendSerializedInput(recipe, {
    ...promptInput,
    ...(structuredProjectBrief
      ? {
          projectBrief: structuredProjectBrief,
          projectBriefDiagnostics: buildProjectBriefDiagnostics(structuredProjectBrief),
        }
      : {}),
    ...(structuredFirstContactTest
      ? {
          firstContactTest: structuredFirstContactTest,
          firstContactTestDiagnostics: buildFirstContactTestDiagnostics(
            structuredFirstContactTest,
          ),
          ...(context.firstContactTestEvidence
            ? {
                firstContactTestEvidence: {
                  ...context.firstContactTestEvidence,
                  exactSaveRequired: true,
                },
              }
            : {}),
        }
      : {}),
    ...(structuredConceptTest
      ? {
          conceptTest: structuredConceptTest,
          conceptTestDiagnostics: buildConceptTestDiagnostics(
            structuredConceptTest,
            structuredProjectBrief,
          ),
          ...(context.conceptTestEvidence
            ? {
                conceptTestEvidence: {
                  ...context.conceptTestEvidence,
                  exactSaveRequired: true,
                },
              }
            : {}),
        }
      : {}),
    ...(uiReferenceUrls
      ? {uiReferenceUrls: uiReferenceUrls.split("\n")}
      : {}),
    domainSelection: parsed.domains === "auto" ? "auto" : "explicit",
    selectedDomains,
    missingChangeInputs,
    intakeDiagnostics,
  });
}

export function buildUiBlindComparePrompt(
  recipe: string,
  input: UiBlindComparePromptArguments,
): string {
  const parsed = UiBlindComparePromptArgumentsSchema.parse(input);
  const {referenceImageIds, ...rest} = parsed;
  return appendSerializedInput(recipe, {
    ...rest,
    referenceImageIds: referenceImageIds.split(","),
  });
}
