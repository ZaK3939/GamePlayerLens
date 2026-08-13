import {z} from "zod";
import {
  buildConceptTestDiagnostics,
  buildFirstContactTestDiagnostics,
  ConceptTestObjectSchema,
  ConceptTestSchema,
  FirstContactTestObjectSchema,
  FirstContactTestSchema,
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
