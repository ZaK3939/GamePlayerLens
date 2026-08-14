import {z} from "zod";
import {
  buildConceptTestDiagnostics,
  buildFirstContactTestDiagnostics,
  buildPlaytestCohortDiagnostics,
  buildPlaytestSessionDiagnostics,
  ConceptTestObjectSchema,
  ConceptTestSchema,
  FirstContactTestObjectSchema,
  FirstContactTestSchema,
  PlaytestCohortObjectSchema,
  PlaytestCohortSchema,
  PlaytestSessionObjectSchema,
  PlaytestSessionSchema,
} from "./manual-tests.js";
import {addSafeSchemaIssues, RevisionIdSchema} from "./prompt-validation.js";

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

function httpUrlSchema(field: string) {
  return z.string().trim().max(2_048).transform((input, context) => {
    try {
      const parsed = new URL(input);
      if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        || parsed.hostname === ""
        || parsed.username !== ""
        || parsed.password !== ""
      ) {
        throw new Error("invalid URL");
      }
      return parsed.href;
    } catch {
      context.addIssue({
        code: "custom",
        message: `${field} must be a credential-free HTTP(S) URL`,
      });
      return z.NEVER;
    }
  });
}

const PlaytestUrlSchema = httpUrlSchema("playtestUrl");
const UiUrlSchema = httpUrlSchema("uiUrl");

const PlaytestDurationSchema = z.string().trim().regex(/^\d{1,3}$/).refine(
  (value) => Number(value) >= 1 && Number(value) <= 120,
  "playtestDurationMinutes must be between 1 and 120",
);

const ProjectBriefTextSchema = z.string().trim().min(1).max(2_000);
const ConceptOriginSchema = z.enum([
  "theme-first",
  "system-first",
  "holistic-image",
  "imitation",
]);
const RewardFamilySchema = z.enum([
  "sensory",
  "mastery",
  "discovery",
  "agency",
  "attachment",
  "aesthetic-emotion",
]);
const RewardFormSchema = z.enum(["inherent", "transition", "mixed"]);
const RewardMechanismSchema = z.object({
  family: RewardFamilySchema,
  form: RewardFormSchema,
  beforeState: ProjectBriefTextSchema,
  playerAction: ProjectBriefTextSchema,
  systemResponse: ProjectBriefTextSchema,
  afterState: ProjectBriefTextSchema,
  perceivedReward: ProjectBriefTextSchema,
  amplifier: ProjectBriefTextSchema.optional(),
}).strict();
export const ProjectBriefObjectSchema = z.object({
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
  conceptOrigin: ConceptOriginSchema.optional(),
  decisionHorizon: ProjectBriefTextSchema.optional(),
  targetPlayer: ProjectBriefTextSchema.optional(),
  themeWorld: ProjectBriefTextSchema.optional(),
  distinctiveSystem: ProjectBriefTextSchema.optional(),
  repeatedAction: ProjectBriefTextSchema.optional(),
  playerDecision: ProjectBriefTextSchema.optional(),
  systemResponse: ProjectBriefTextSchema.optional(),
  rewardMechanisms: z.array(RewardMechanismSchema).min(1).max(6).optional(),
  oneSentencePromise: ProjectBriefTextSchema.optional(),
  coreProofMoment: ProjectBriefTextSchema.optional(),
  knownFrame: ProjectBriefTextSchema.optional(),
  sourceAction: ProjectBriefTextSchema.optional(),
  sourceSystemResponse: ProjectBriefTextSchema.optional(),
  sourceReward: ProjectBriefTextSchema.optional(),
  meaningfulDifference: ProjectBriefTextSchema.optional(),
  teamCapacity: ProjectBriefTextSchema.optional(),
  runwayMonths: z.number().finite().min(0).max(600).optional(),
  nextIrreversibleCommitment: ProjectBriefTextSchema.optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  "projectBrief must contain at least one supported field",
);

export type ProjectBrief = z.infer<typeof ProjectBriefObjectSchema>;
type ProjectBriefField = keyof ProjectBrief;

const PROJECT_BRIEF_FIELD_GROUPS = {
  coreExperience: [
    "targetPlayer",
    "themeWorld",
    "distinctiveSystem",
    "repeatedAction",
    "playerDecision",
    "systemResponse",
    "rewardMechanisms",
    "oneSentencePromise",
    "coreProofMoment",
  ],
  differentiation: [
    "conceptOrigin",
    "knownFrame",
    "sourceAction",
    "sourceSystemResponse",
    "sourceReward",
    "meaningfulDifference",
  ],
  decisionContext: [
    "revisionId",
    "developmentStage",
    "decisionHorizon",
    "teamCapacity",
    "runwayMonths",
    "nextIrreversibleCommitment",
  ],
} as const satisfies Record<string, readonly ProjectBriefField[]>;

const CONCEPT_ROUTE_REQUIREMENTS = {
  "theme-first": [
    "targetPlayer",
    "themeWorld",
    "distinctiveSystem",
    "repeatedAction",
    "systemResponse",
    "rewardMechanisms",
    "oneSentencePromise",
    "coreProofMoment",
  ],
  "system-first": [
    "targetPlayer",
    "distinctiveSystem",
    "themeWorld",
    "repeatedAction",
    "systemResponse",
    "rewardMechanisms",
    "oneSentencePromise",
    "coreProofMoment",
  ],
  "holistic-image": [
    "targetPlayer",
    "themeWorld",
    "distinctiveSystem",
    "repeatedAction",
    "systemResponse",
    "rewardMechanisms",
    "oneSentencePromise",
    "coreProofMoment",
  ],
  imitation: [
    "targetPlayer",
    "themeWorld",
    "knownFrame",
    "sourceAction",
    "sourceSystemResponse",
    "sourceReward",
    "meaningfulDifference",
    "distinctiveSystem",
    "repeatedAction",
    "systemResponse",
    "rewardMechanisms",
    "oneSentencePromise",
    "coreProofMoment",
  ],
} as const satisfies Record<
  z.infer<typeof ConceptOriginSchema>,
  readonly ProjectBriefField[]
>;

const CONCEPT_ROUTE_QUESTIONS = {
  "theme-first": "For this target player, what action exists naturally because of the theme, what reward follows, and which shortest observable moment proves it?",
  "system-first": "Which theme gives this system emotional meaning for the target player, and which shortest observable moment proves the fit?",
  "holistic-image": "Which concrete theme and repeatable system turn the broad image into an observable action-response-reward moment for the target player?",
  imitation: "What source action-response-reward mechanism matters, how does the target theme change it, and which shortest observable moment proves the difference?",
} as const satisfies Record<z.infer<typeof ConceptOriginSchema>, string>;

const MECHANISM_TRANSFER_REQUIREMENTS = [
  "knownFrame",
  "sourceAction",
  "sourceSystemResponse",
  "sourceReward",
  "meaningfulDifference",
] as const satisfies readonly ProjectBriefField[];

function buildConceptRouteDiagnostics(projectBrief: ProjectBrief) {
  const origin = projectBrief.conceptOrigin;
  if (!origin) {
    return {
      status: "origin-not-declared",
      missingFields: ["conceptOrigin"],
      nextQuestion: "Did this concept begin theme-first, system-first, as a holistic image, or as an imitation of a known game?",
      interpretationLimit: "Concept origin selects the next questions only; it is not a quality category or evidence of fun.",
    };
  }

  const missingFields = CONCEPT_ROUTE_REQUIREMENTS[origin].filter(
    (field) => projectBrief[field] === undefined,
  );
  return {
    origin,
    status: missingFields.length > 0
      ? "needs-counterpart"
      : "declared-route-ready-for-validation",
    missingFields,
    nextQuestion: CONCEPT_ROUTE_QUESTIONS[origin],
    interpretationLimit: "Declared fields only guide the next review; surface features do not establish a transferable play mechanism or fun.",
  };
}

function buildMechanismTransferDiagnostics(projectBrief: ProjectBrief) {
  const sourceLoopDeclared = projectBrief.sourceAction !== undefined
    || projectBrief.sourceSystemResponse !== undefined
    || projectBrief.sourceReward !== undefined;
  const applies = projectBrief.conceptOrigin === "imitation"
    || projectBrief.knownFrame !== undefined
    || sourceLoopDeclared;
  if (!applies) {
    return {
      status: "not-required-from-brief",
      missingFields: [],
      interpretationLimit: "No imitation origin or Known Frame was declared; competition evidence can still make a Mechanism Transfer Map necessary later.",
    };
  }

  const missingFields = MECHANISM_TRANSFER_REQUIREMENTS.filter(
    (field) => projectBrief[field] === undefined,
  );
  const sourceLoopMissing = missingFields.some((field) => (
    field === "sourceAction"
    || field === "sourceSystemResponse"
    || field === "sourceReward"
  ));
  const status = missingFields.length === 0
    ? "declared-transfer-ready-for-validation"
    : sourceLoopMissing
      ? "source-mechanism-missing"
      : missingFields.includes("knownFrame")
        ? "source-frame-missing"
        : "target-adaptation-missing";

  return {
    applicabilityReason: projectBrief.conceptOrigin === "imitation"
      ? "imitation-origin"
      : projectBrief.knownFrame !== undefined
        ? "known-frame-declared"
        : "source-loop-declared",
    status,
    missingFields,
    nextQuestion: sourceLoopMissing
      ? "In the source game, what does the player repeatedly do, how does the system respond, and what reward follows?"
      : missingFields.includes("knownFrame")
        ? "Which source game or established genre frame does this declared loop describe?"
        : "Which target action, decision, response, or reward changes enough to create a meaningful difference?",
    interpretationLimit: "Declared source mechanics are hypotheses, not proof of the source game's internal design or player reward; validate them with source evidence and keep proxy limits explicit.",
  };
}

function buildRewardMechanismDiagnostics(projectBrief: ProjectBrief) {
  const mechanisms = projectBrief.rewardMechanisms;
  if (!mechanisms) {
    return {
      status: "reward-mechanism-missing",
      mechanismCount: 0,
      missingFields: ["rewardMechanisms"],
      nextQuestion: "For each intended reward, what is the before state, player action, system response, after state, perceived reward, family, and form?",
      interpretationLimit: "No structured reward mechanism was declared; do not infer one from theme, genre, or feature labels.",
    };
  }

  const countBy = <T extends string>(values: T[]): Partial<Record<T, number>> => {
    const counts: Partial<Record<T, number>> = {};
    for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  };
  return {
    status: "declared-mechanisms-ready-for-validation",
    mechanismCount: mechanisms.length,
    missingFields: [],
    familyCounts: countBy(mechanisms.map((mechanism) => mechanism.family)),
    formCounts: countBy(mechanisms.map((mechanism) => mechanism.form)),
    amplifiedCount: mechanisms.filter((mechanism) => mechanism.amplifier !== undefined).length,
    nextQuestion: "Which declared reward can be observed next in a build, first-contact test, or human playtest?",
    interpretationLimit: "Declared reward mechanisms are hypotheses, not observed player reward or fun; validate delivery and perception separately.",
  };
}

export function buildProjectBriefDiagnostics(projectBrief: ProjectBrief) {
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
    conceptRoute: buildConceptRouteDiagnostics(projectBrief),
    rewardMechanism: buildRewardMechanismDiagnostics(projectBrief),
    mechanismTransfer: buildMechanismTransferDiagnostics(projectBrief),
    interpretationLimit: "Field presence is not a quality score, evidence result, or milestone pass.",
  };
}

const PROJECT_BRIEF_SAFE_FIELDS = new Set<string>([
  ...Object.values(PROJECT_BRIEF_FIELD_GROUPS).flat(),
  "family",
  "form",
  "beforeState",
  "playerAction",
  "systemResponse",
  "afterState",
  "perceivedReward",
  "amplifier",
]);

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

export const SubjectKindSchema = z.enum([
  "existing-game",
  "developer-concept",
  "developer-project",
]);

export const RunSimPromptArgumentsSchema = z.object({
  target: NonEmptyTrimmedStringSchema.describe("Game or proposal to evaluate"),
  topic: NonEmptyTrimmedStringSchema.describe("Consultation topic"),
  subjectKind: SubjectKindSchema.optional().describe("Whether the subject is an existing game, a developer concept, or an active developer project"),
  mode: z.enum(["baseline", "change"]).default("baseline"),
  domains: DomainsSchema.default("auto"),
  specification: z.string().max(50_000).optional(),
  projectBrief: ProjectBriefSchema.optional().describe(
    "JSON object containing declared concept origin, project stage, core experience, and production constraints",
  ),
  conceptTest: ConceptTestSchema.optional().describe(
    "JSON object containing a bounded, pseudonymous third-party concept comprehension test",
  ),
  firstContactTest: FirstContactTestSchema.optional().describe(
    "JSON object containing a bounded, pseudonymous first-contact asset test",
  ),
  playtestSession: PlaytestSessionSchema.optional().describe(
    "JSON object containing one chronological, evidence-linked playtest session",
  ),
  playtestCohort: PlaytestCohortSchema.optional().describe(
    "JSON object containing 2 to 20 full playtest sessions for bounded descriptive aggregation",
  ),
  playtestUrl: PlaytestUrlSchema.optional(),
  playtestTask: z.string().trim().min(1).max(1_000).optional(),
  playtestBuild: z.string().trim().min(1).max(200).optional(),
  playtestControls: z.string().trim().min(1).max(500).optional(),
  playtestDurationMinutes: PlaytestDurationSchema.optional(),
  uiUrl: UiUrlSchema.optional(),
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
  if (value.playtestSession && value.playtestCohort) {
    context.addIssue({
      code: "custom",
      path: ["playtestCohort"],
      message: "playtestSession and playtestCohort must not be supplied together",
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
  playtestSessionEvidence?: {
    sourceTool: "manual";
    observedAt: string;
    resultHandle: string;
  };
  playtestCohortEvidence?: {
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

export function buildPlaytestSessionEvidenceEnvelope(input: RunSimPromptArguments) {
  const parsed = RunSimPromptArgumentsSchema.parse(input);
  if (!parsed.playtestSession) return undefined;
  const playtestSession = PlaytestSessionObjectSchema.parse(
    JSON.parse(parsed.playtestSession),
  );
  return {
    data: playtestSession,
    warnings: [] as string[],
    meta: {observedAt: playtestSession.startedAt},
  };
}

export function buildPlaytestCohortEvidenceEnvelope(input: RunSimPromptArguments) {
  const parsed = RunSimPromptArgumentsSchema.parse(input);
  if (!parsed.playtestCohort) return undefined;
  const playtestCohort = PlaytestCohortObjectSchema.parse(
    JSON.parse(parsed.playtestCohort),
  );
  const latestSession = playtestCohort.sessions.reduce((latest, session) =>
    Date.parse(session.endedAt) > Date.parse(latest.endedAt) ? session : latest
  );
  return {
    data: playtestCohort,
    warnings: [] as string[],
    meta: {observedAt: latestSession.endedAt},
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
  const {
    conceptTest,
    firstContactTest,
    playtestCohort,
    playtestSession,
    projectBrief,
    uiReferenceUrls,
    ...promptInput
  } = parsed;
  const structuredProjectBrief = projectBrief
    ? ProjectBriefObjectSchema.parse(JSON.parse(projectBrief))
    : undefined;
  const projectBriefDiagnostics = structuredProjectBrief
    ? buildProjectBriefDiagnostics(structuredProjectBrief)
    : undefined;
  const selectedDomains = parsed.domains === "auto"
    ? undefined
    : parsed.domains.split(",");
  const missingChangeInputs = parsed.mode === "change"
    ? (["currentState", "proposal"] as const).filter((field) => !parsed[field]?.trim())
    : undefined;
  const requiresDeveloperBrief = parsed.subjectKind === "developer-concept"
    || parsed.subjectKind === "developer-project";
  const missingDeveloperBriefFields = !requiresDeveloperBrief
    ? []
    : !structuredProjectBrief || !projectBriefDiagnostics
      ? ["projectBrief"]
      : [...new Set([
          ...projectBriefDiagnostics.conceptRoute.missingFields,
          ...projectBriefDiagnostics.rewardMechanism.missingFields,
          ...projectBriefDiagnostics.mechanismTransfer.missingFields,
        ])].map((field) => `projectBrief.${field}`);
  const missingFields = [...new Set([
    ...(!parsed.subjectKind ? ["subjectKind"] : []),
    ...(!parsed.market?.trim() ? ["market"] : []),
    ...(!parsed.language?.trim() ? ["language"] : []),
    ...(missingChangeInputs ?? []),
    ...(selectedDomains?.includes("ui") && !parsed.uiBenchmarkTask?.trim()
      ? ["uiBenchmarkTask"]
      : []),
    ...missingDeveloperBriefFields,
  ])];
  const intakeDiagnostics = {
    status: missingFields.length === 0 ? "ready" : "needs-input",
    missingFields,
    nextAction: missingFields.length === 0
      ? "Proceed with the selected evidence workflow."
      : "Ask the user for all missing fields in one concise question before calling external evidence tools.",
  };
  const structuredConceptTest = conceptTest
    ? ConceptTestObjectSchema.parse(JSON.parse(conceptTest))
    : undefined;
  const structuredFirstContactTest = firstContactTest
    ? FirstContactTestObjectSchema.parse(JSON.parse(firstContactTest))
    : undefined;
  const structuredPlaytestSession = playtestSession
    ? PlaytestSessionObjectSchema.parse(JSON.parse(playtestSession))
    : undefined;
  const structuredPlaytestCohort = playtestCohort
    ? PlaytestCohortObjectSchema.parse(JSON.parse(playtestCohort))
    : undefined;

  return appendSerializedInput(recipe, {
    ...promptInput,
    ...(structuredProjectBrief
      ? {
          projectBrief: structuredProjectBrief,
          projectBriefDiagnostics,
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
    ...(structuredPlaytestSession
      ? {
          playtestSession: structuredPlaytestSession,
          playtestSessionDiagnostics: buildPlaytestSessionDiagnostics(
            structuredPlaytestSession,
            {
              playtestBuild: parsed.playtestBuild,
              playtestTask: parsed.playtestTask,
              playtestControls: parsed.playtestControls,
            },
          ),
          ...(context.playtestSessionEvidence
            ? {
                playtestSessionEvidence: {
                  ...context.playtestSessionEvidence,
                  exactSaveRequired: true,
                },
              }
            : {}),
        }
      : {}),
    ...(structuredPlaytestCohort
      ? {
          playtestCohort: structuredPlaytestCohort,
          playtestCohortDiagnostics: buildPlaytestCohortDiagnostics(
            structuredPlaytestCohort,
          ),
          ...(context.playtestCohortEvidence
            ? {
                playtestCohortEvidence: {
                  ...context.playtestCohortEvidence,
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
