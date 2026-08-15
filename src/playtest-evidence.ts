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
export const TargetFitSchema = z.enum(["high", "medium", "low", "unknown"]);
export const UnderstandingSchema = z.enum(["yes", "no", "unclear", "not-measured"]);
export const InterestSchema = z.enum(["would-play", "maybe", "would-not-play", "not-asked"]);
export const ImmediateRejectSchema = z.enum(["yes", "no", "unclear", "not-asked"]);
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
  parentField: "parentStimulusId" | "parentAssetId" | "parentSessionId",
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
  understoodTheme: UnderstandingSchema,
  themeSystemFit: UnderstandingSchema,
  themeSystemFitReason: ManualTestTextSchema.optional(),
  understoodAction: UnderstandingSchema,
  understoodReward: UnderstandingSchema,
  interest: InterestSchema,
  unaidedSummary: ManualTestTextSchema.optional(),
  confusions: z.array(ManualTestTextSchema).max(20),
}).strict().superRefine((value, context) => {
  if (
    (value.themeSystemFit === "no" || value.themeSystemFit === "unclear")
    && value.themeSystemFitReason === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["themeSystemFitReason"],
      message: "themeSystemFitReason is required for no or unclear theme-system fit observations",
    });
  }
});

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
  "participantId", "targetFit", "understoodTheme", "themeSystemFit",
  "themeSystemFitReason", "understoodAction", "understoodReward", "interest",
  "unaidedSummary", "confusions",
]);

export const ConceptTestSchema = createJsonStringSchema(
  "conceptTest",
  50_000,
  ConceptTestObjectSchema,
  CONCEPT_TEST_SAFE_FIELDS,
);

export const FirstContactAssetTypeSchema = z.enum([
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

export const VisualQualitySchema = z.enum([
  "credible",
  "rough",
  "style-mismatch",
  "unclear",
  "not-assessed",
]);
export const ThemeAppealSchema = z.enum(["yes", "no", "unclear", "not-assessed"]);
export const TryIntentSchema = z.enum(["yes", "maybe", "no", "not-asked"]);

export const FirstContactParticipantSchema = z.object({
  participantId: PseudonymousParticipantIdSchema,
  targetFit: TargetFitSchema,
  visualQuality: VisualQualitySchema,
  visualQualityReason: ManualTestTextSchema.optional(),
  understoodTheme: UnderstandingSchema,
  themeAppeal: ThemeAppealSchema,
  themeAppealReason: ManualTestTextSchema.optional(),
  understoodAction: UnderstandingSchema,
  understoodReward: UnderstandingSchema,
  tryIntent: TryIntentSchema,
  tryIntentReason: ManualTestTextSchema.optional(),
  immediateReject: ImmediateRejectSchema,
  unaidedSummary: ManualTestTextSchema.optional(),
  rejectionReason: ManualTestTextSchema.optional(),
  confusions: z.array(ManualTestTextSchema).max(20),
}).strict().superRefine((value, context) => {
  if (
    (value.visualQuality === "rough" || value.visualQuality === "style-mismatch")
    && value.visualQualityReason === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["visualQualityReason"],
      message: "visualQualityReason is required for rough or style-mismatch observations",
    });
  }
  if (
    (value.themeAppeal === "no" || value.themeAppeal === "unclear")
    && value.themeAppealReason === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["themeAppealReason"],
      message: "themeAppealReason is required for no or unclear theme appeal observations",
    });
  }
  if (
    (value.tryIntent === "maybe" || value.tryIntent === "no")
    && value.tryIntentReason === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["tryIntentReason"],
      message: "tryIntentReason is required for maybe or no try intent observations",
    });
  }
});

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

export const FirstContactRecordInputSchema = z.object({
  testedAt: z.iso.datetime({offset: true}),
  assetId: RevisionIdSchema,
  parentAssetId: RevisionIdSchema.optional(),
  ...RevisionDesignShape,
  assetType: FirstContactAssetTypeSchema,
  assetDescription: ManualTestTextSchema,
  exposure: z.object({
    device: ManualTestTextSchema,
    viewport: ManualTestTextSchema.optional(),
    durationSeconds: z.number().finite().positive().max(3_600).optional(),
    sound: z.enum(["on", "off", "not-applicable", "unknown"]),
  }).strict(),
  recruitment: ManualTestTextSchema,
  targetPlayerDefinition: ManualTestTextSchema,
  participants: z.array(FirstContactParticipantSchema).min(1).max(50),
  deviations: z.array(ManualTestTextSchema).max(20).optional(),
}).strict();

export function buildFirstContactTestRecord(
  input: z.input<typeof FirstContactRecordInputSchema>,
): FirstContactTest {
  const parsed = FirstContactRecordInputSchema.parse(input);
  const {exposure, ...record} = parsed;
  return FirstContactTestObjectSchema.parse({
    ...record,
    exposureContext: {
      ...exposure,
      orderDescription: "Asset shown once without explanation before questions.",
    },
    questionsAsked: [
      "What do you think this game is about?",
      "What would you do first?",
      "What result or reward do you expect?",
      "Would you try it, and why?",
    ],
  });
}

const FIRST_CONTACT_TEST_SAFE_FIELDS = new Set<string>([
  "testedAt", "assetId", "parentAssetId", "changeSummary", "changedVariables",
  "invariantsKept", "assetType", "assetDescription", "exposureContext", "device",
  "viewport", "durationSeconds", "sound", "orderDescription", "recruitment",
  "targetPlayerDefinition", "questionsAsked", "participants", "deviations",
  "participantId", "targetFit", "visualQuality", "visualQualityReason",
  "understoodTheme", "themeAppeal", "themeAppealReason", "understoodAction",
  "understoodReward", "tryIntent", "tryIntentReason", "immediateReject",
  "unaidedSummary", "rejectionReason",
  "confusions",
]);

export const FirstContactTestSchema = createJsonStringSchema(
  "firstContactTest",
  50_000,
  FirstContactTestObjectSchema,
  FIRST_CONTACT_TEST_SAFE_FIELDS,
);

export const PlaytestEventTypeSchema = z.enum([
  "action",
  "feedback",
  "failure",
  "retry",
  "reward",
  "progress",
  "goal",
  "technical",
]);
const PlaytestSessionIdSchema = z.string().trim().min(1).max(47).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "playtest session IDs must use lowercase kebab-case",
);
const PlaytestCohortIdSchema = z.string().trim().min(1).max(48).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "playtest cohort IDs must use lowercase kebab-case",
);
export const FrictionSeveritySchema = z.enum(["none", "minor", "material", "blocker"]);
export const RewardSignalSchema = z.enum([
  "demonstrated",
  "not-observed",
  "unclear",
  "not-assessed",
]);
const PlaytestObservationSchema = z.object({
  step: z.number().int().positive().max(200),
  elapsedSeconds: z.number().finite().min(0).max(7_200),
  eventType: PlaytestEventTypeSchema,
  meaningfulAction: z.boolean(),
  playerIntent: ManualTestTextSchema,
  inputAction: ManualTestTextSchema,
  systemResponse: ManualTestTextSchema,
  expectedDifference: ManualTestTextSchema.optional(),
  frictionSeverity: FrictionSeveritySchema,
  rewardSignal: RewardSignalSchema,
  evidenceIds: z.array(RevisionIdSchema).max(10).optional(),
}).strict();

const HumanPlaytestReportSchema = z.object({
  feltReward: z.enum(["yes", "no", "unclear", "not-asked"]),
  rewardDescription: ManualTestTextSchema.optional(),
  wouldRepeat: z.enum(["yes", "maybe", "no", "not-asked"]),
  confusions: z.array(ManualTestTextSchema).max(20),
}).strict();

export const PlaytestExecutionEnvironmentSchema = z.object({
  operatingSystem: ManualTestTextSchema,
  device: ManualTestTextSchema,
  runtime: ManualTestTextSchema,
  rendererBackend: z.enum([
    "webgpu",
    "webgl2",
    "webgl1",
    "canvas2d",
    "native",
    "other",
    "not-applicable",
  ]),
  rendererImplementation: ManualTestTextSchema,
  graphicsAcceleration: z.enum([
    "hardware",
    "software",
    "unknown",
    "not-applicable",
  ]),
  viewport: z.object({
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
    devicePixelRatio: z.number().finite().positive().max(10),
  }).strict(),
}).strict();

export const PlaytestSessionObjectSchema = z.object({
  startedAt: z.iso.datetime({offset: true}),
  endedAt: z.iso.datetime({offset: true}),
  sessionId: PlaytestSessionIdSchema,
  parentSessionId: PlaytestSessionIdSchema.optional(),
  ...RevisionDesignShape,
  buildId: ManualTestTextSchema,
  executionEnvironment: PlaytestExecutionEnvironmentSchema,
  controls: ManualTestTextSchema,
  task: ManualTestTextSchema,
  startState: ManualTestTextSchema,
  endState: ManualTestTextSchema,
  testerType: z.enum(["human-participant", "ai-operated"]),
  participantId: PseudonymousParticipantIdSchema.optional(),
  targetFit: TargetFitSchema.optional(),
  observationSource: z.enum(["direct-session", "moderated", "recording-review"]),
  priorKnowledge: z.enum([
    "none",
    "storefront-only",
    "tutorial-known",
    "specification",
    "source-code",
    "prior-session",
    "other",
  ]),
  priorKnowledgeDetails: ManualTestTextSchema.optional(),
  observations: z.array(PlaytestObservationSchema).min(1).max(200),
  outcome: z.enum(["completed", "failed", "blocked", "stopped"]),
  stopReason: ManualTestTextSchema.optional(),
  humanReport: HumanPlaytestReportSchema.optional(),
  deviations: z.array(ManualTestTextSchema).max(20).optional(),
}).strict().superRefine((value, context) => {
  validateRevisionDesign({
    parentId: value.parentSessionId,
    currentId: value.sessionId,
    changeSummary: value.changeSummary,
    changedVariables: value.changedVariables,
    invariantsKept: value.invariantsKept,
  }, context, "parentSessionId");
  const durationSeconds = (Date.parse(value.endedAt) - Date.parse(value.startedAt)) / 1_000;
  if (durationSeconds <= 0 || durationSeconds > 7_200) {
    context.addIssue({
      code: "custom",
      path: ["endedAt"],
      message: "playtest session duration must be between 1 second and 120 minutes",
    });
  }
  if (value.testerType === "human-participant") {
    if (!value.participantId) {
      context.addIssue({
        code: "custom",
        path: ["participantId"],
        message: "participantId is required for a human participant",
      });
    }
    if (!value.targetFit) {
      context.addIssue({
        code: "custom",
        path: ["targetFit"],
        message: "targetFit is required for a human participant",
      });
    }
  } else {
    if (value.participantId || value.targetFit) {
      context.addIssue({
        code: "custom",
        path: ["participantId"],
        message: "AI-operated sessions must not claim a human participant",
      });
    }
    if (value.humanReport) {
      context.addIssue({
        code: "custom",
        path: ["humanReport"],
        message: "AI-operated sessions must not contain a humanReport",
      });
    }
  }
  if (value.outcome !== "completed" && !value.stopReason) {
    context.addIssue({
      code: "custom",
      path: ["stopReason"],
      message: "stopReason is required when the session did not complete",
    });
  }
  let previousElapsed = -1;
  for (const [index, observation] of value.observations.entries()) {
    if (observation.step !== index + 1 || observation.elapsedSeconds < previousElapsed) {
      context.addIssue({
        code: "custom",
        path: ["observations", index],
        message: "observations must use contiguous steps and nondecreasing elapsedSeconds",
      });
    }
    if (observation.elapsedSeconds > durationSeconds) {
      context.addIssue({
        code: "custom",
        path: ["observations", index, "elapsedSeconds"],
        message: "observation time must fall within the session",
      });
    }
    previousElapsed = observation.elapsedSeconds;
  }
});

export type PlaytestSession = z.infer<typeof PlaytestSessionObjectSchema>;

const PLAYTEST_SESSION_SAFE_FIELDS = new Set<string>([
  "startedAt", "endedAt", "sessionId", "parentSessionId", "changeSummary",
  "changedVariables", "invariantsKept", "buildId", "executionEnvironment",
  "operatingSystem", "device", "runtime", "rendererBackend",
  "rendererImplementation", "graphicsAcceleration", "viewport", "width",
  "height", "devicePixelRatio", "controls",
  "task", "startState", "endState", "testerType", "participantId", "targetFit",
  "observationSource", "priorKnowledge", "priorKnowledgeDetails", "observations",
  "outcome", "stopReason", "humanReport", "deviations", "step", "elapsedSeconds",
  "eventType", "meaningfulAction", "playerIntent", "inputAction", "systemResponse",
  "expectedDifference", "frictionSeverity", "rewardSignal", "evidenceIds",
  "feltReward", "rewardDescription", "wouldRepeat", "confusions",
]);

export const PlaytestSessionSchema = createJsonStringSchema(
  "playtestSession",
  100_000,
  PlaytestSessionObjectSchema,
  PLAYTEST_SESSION_SAFE_FIELDS,
);

export const PlaytestCohortObjectSchema = z.object({
  assembledAt: z.iso.datetime({offset: true}),
  cohortId: PlaytestCohortIdSchema,
  purpose: ManualTestTextSchema,
  recruitment: ManualTestTextSchema,
  targetPlayerDefinition: ManualTestTextSchema,
  samplingBoundary: ManualTestTextSchema,
  sessions: z.array(PlaytestSessionObjectSchema).min(2).max(20),
}).strict().superRefine((value, context) => {
  const assembledAt = Date.parse(value.assembledAt);
  const sessionsById = new Map<string, PlaytestSession>();
  for (const [index, session] of value.sessions.entries()) {
    if (sessionsById.has(session.sessionId)) {
      context.addIssue({
        code: "custom",
        path: ["sessions", index, "sessionId"],
        message: "playtest cohort sessionId values must be unique",
      });
    } else {
      sessionsById.set(session.sessionId, session);
    }
    if (Date.parse(session.endedAt) > assembledAt) {
      context.addIssue({
        code: "custom",
        path: ["assembledAt"],
        message: "assembledAt must not precede a cohort session",
      });
    }
  }

  if (sessionsById.size !== value.sessions.length) return;
  for (const [index, session] of value.sessions.entries()) {
    if (!session.parentSessionId) continue;
    const parent = sessionsById.get(session.parentSessionId);
    if (parent && Date.parse(parent.endedAt) >= Date.parse(session.startedAt)) {
      context.addIssue({
        code: "custom",
        path: ["sessions", index, "parentSessionId"],
        message: "an internal parent session must end before its retest starts",
      });
    }

    const visited = new Set<string>();
    let current: PlaytestSession | undefined = session;
    while (current) {
      if (visited.has(current.sessionId)) {
        context.addIssue({
          code: "custom",
          path: ["sessions", index, "parentSessionId"],
          message: "playtest cohort lineage must not contain a cycle",
        });
        break;
      }
      visited.add(current.sessionId);
      current = current.parentSessionId
        ? sessionsById.get(current.parentSessionId)
        : undefined;
    }
  }
});

export type PlaytestCohort = z.infer<typeof PlaytestCohortObjectSchema>;

const PLAYTEST_COHORT_SAFE_FIELDS = new Set<string>([
  ...PLAYTEST_SESSION_SAFE_FIELDS,
  "assembledAt", "cohortId", "purpose", "recruitment",
  "targetPlayerDefinition", "samplingBoundary", "sessions",
]);

export const PlaytestCohortSchema = createJsonStringSchema(
  "playtestCohort",
  200_000,
  PlaytestCohortObjectSchema,
  PLAYTEST_COHORT_SAFE_FIELDS,
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
