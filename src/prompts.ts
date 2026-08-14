import {z} from "zod";
import {
  AuditSnapshotBundleObjectSchema,
  AuditSnapshotBundleSchema,
} from "./audit-snapshot.js";
import {
  buildConceptTestDiagnostics,
  buildFirstContactTestDiagnostics,
  buildPlaytestCohortDiagnostics,
  buildPlaytestSessionDiagnostics,
  ConceptTestObjectSchema,
  ConceptTestSchema,
  FirstContactTestObjectSchema,
  type FirstContactTest,
  PlaytestCohortObjectSchema,
  PlaytestCohortSchema,
  PlaytestSessionObjectSchema,
  PlaytestSessionSchema,
} from "./playtest-evidence.js";
import {
  buildProjectBriefDiagnostics,
  ProjectBriefObjectSchema,
  ProjectBriefSchema,
  SubjectKindSchema,
} from "./project-brief.js";
import {compileGameReviewRecipe} from "./run-recipe.js";
import {
  RevisionBundleObjectSchema,
  RevisionBundleSchema,
} from "./revision-bundle.js";
import type {SimulationDomain} from "./run-schemas.js";

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
  const unknown = domains.filter((domain) => !DOMAIN_VALUES.has(domain));
  if (domains.length === 0 || unknown.length > 0) {
    context.addIssue({
      code: "custom",
      message: unknown.length > 0
        ? `Unknown domains: ${[...new Set(unknown)].join(", ")}`
        : "At least one domain is required",
    });
    return z.NEVER;
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

const GameReviewPromptArgumentShape = {
  target: NonEmptyTrimmedStringSchema.describe("Game or proposal to evaluate"),
  topic: NonEmptyTrimmedStringSchema.describe("Consultation topic"),
  subjectKind: SubjectKindSchema.optional().describe("Whether the subject is an existing game, a developer concept, or an active developer project"),
  mode: z.enum(["baseline", "change"]).default("baseline"),
  domains: DomainsSchema.optional().describe(
    "Explicit comma-separated review domains; omission returns needs-input",
  ),
  specification: z.string().max(50_000).optional(),
  projectBrief: ProjectBriefSchema.optional().describe(
    "JSON object containing declared concept origin, project stage, core experience, and production constraints",
  ),
  conceptTest: ConceptTestSchema.optional().describe(
    "JSON object containing a bounded, pseudonymous third-party concept comprehension test",
  ),
  firstContactResultHandle: z.uuid().optional().describe(
    "Result handle returned by record_first_contact",
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
  revisionBundle: RevisionBundleSchema.optional().describe(
    "JSON object binding current and candidate Git commits and build artifacts",
  ),
  auditSnapshotBundle: AuditSnapshotBundleSchema.optional().describe(
    "JSON object binding one audited Git commit and build ID to saved artifact hashes",
  ),
  uiUrl: UiUrlSchema.optional(),
  uiBenchmarkTask: z.string().trim().min(1).max(500).optional(),
  uiReferenceUrls: UiReferenceUrlsSchema.optional(),
  currentState: z.string().optional(),
  proposal: z.string().optional(),
  competitors: z.string().optional(),
  market: z.string().optional(),
  language: z.string().optional(),
  qualityTier: z.string().optional(),
};

const {
  mode: _reviewMode,
  auditSnapshotBundle: _reviewAuditSnapshotBundle,
  ...ReviewChangePromptArgumentShape
} = GameReviewPromptArgumentShape;
const {
  mode: _auditMode,
  currentState: _auditCurrentState,
  proposal: _auditProposal,
  revisionBundle: _auditRevisionBundle,
  ...AuditProjectPromptArgumentShape
} = GameReviewPromptArgumentShape;

function addSharedPromptIssues(
  value: {
    playtestUrl?: string;
    playtestTask?: string;
    playtestSession?: string;
    playtestCohort?: string;
  },
  context: {addIssue: (issue: {
    code: "custom";
    path: string[];
    message: string;
  }) => void},
): void {
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
}

export const GameReviewPromptArgumentsSchema = z.object(GameReviewPromptArgumentShape)
  .superRefine(addSharedPromptIssues);

export const ReviewChangePromptArgumentsSchema = z.object(
  ReviewChangePromptArgumentShape,
).strict().superRefine(addSharedPromptIssues);

export const AuditProjectPromptArgumentsSchema = z.object(
  AuditProjectPromptArgumentShape,
).strict().superRefine(addSharedPromptIssues);

export const UiBlindComparePromptArgumentsSchema = z.object({
  targetImageId: NonEmptyTrimmedStringSchema,
  referenceImageIds: ReferenceImageIdsSchema,
  context: z.string().optional(),
  qualityTier: z.string().optional(),
});

export type GameReviewPromptArguments = z.input<typeof GameReviewPromptArgumentsSchema>;
export type ReviewChangePromptArguments = z.input<
  typeof ReviewChangePromptArgumentsSchema
>;
export type AuditProjectPromptArguments = z.input<
  typeof AuditProjectPromptArgumentsSchema
>;
export type UiBlindComparePromptArguments = z.input<typeof UiBlindComparePromptArgumentsSchema>;

export interface PromptEvidencePointer {
  sourceTool: "manual" | "record_first_contact";
  observedAt: string;
  resultHandle: string;
}

export interface GameReviewPromptContext {
  reviewWorkflow?: "change" | "audit";
  conceptTestEvidence?: PromptEvidencePointer;
  firstContactTestEvidence?: PromptEvidencePointer;
  firstContactTest?: FirstContactTest;
  playtestSessionEvidence?: PromptEvidencePointer;
  playtestCohortEvidence?: PromptEvidencePointer;
  revisionBundleEvidence?: PromptEvidencePointer;
  auditSnapshotBundleEvidence?: PromptEvidencePointer;
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

export function buildGameReviewPrompt(
  recipe: string,
  input: GameReviewPromptArguments,
  context: GameReviewPromptContext = {},
): string {
  const parsed = GameReviewPromptArgumentsSchema.parse(input);
  const {
    conceptTest,
    auditSnapshotBundle,
    firstContactResultHandle: _firstContactResultHandle,
    playtestCohort,
    playtestSession,
    projectBrief,
    revisionBundle,
    uiReferenceUrls,
    ...promptInput
  } = parsed;
  const structuredProjectBrief = projectBrief
    ? ProjectBriefObjectSchema.parse(JSON.parse(projectBrief))
    : undefined;
  const projectBriefDiagnostics = structuredProjectBrief
    ? buildProjectBriefDiagnostics(structuredProjectBrief)
    : undefined;
  const structuredAuditSnapshotBundle = auditSnapshotBundle
    ? AuditSnapshotBundleObjectSchema.parse(JSON.parse(auditSnapshotBundle))
    : undefined;
  const selectedDomains = parsed.domains
    ? parsed.domains.split(",") as SimulationDomain[]
    : [];
  const missingChangeInputs = parsed.mode === "change"
    ? (["currentState", "proposal", "revisionBundle"] as const)
        .filter((field) => !parsed[field]?.trim())
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
    ...(!parsed.domains ? ["domains"] : []),
    ...(!parsed.market?.trim() ? ["market"] : []),
    ...(!parsed.language?.trim() ? ["language"] : []),
    ...(missingChangeInputs ?? []),
    ...(selectedDomains?.includes("ui") && !parsed.uiBenchmarkTask?.trim()
      ? ["uiBenchmarkTask"]
      : []),
    ...(parsed.mode === "baseline"
      && parsed.subjectKind === "developer-project"
      && !structuredAuditSnapshotBundle
      ? ["auditSnapshotBundle"]
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
  const structuredFirstContactTest = context.firstContactTest
    ? FirstContactTestObjectSchema.parse(context.firstContactTest)
    : undefined;
  const structuredPlaytestSession = playtestSession
    ? PlaytestSessionObjectSchema.parse(JSON.parse(playtestSession))
    : undefined;
  const structuredPlaytestCohort = playtestCohort
    ? PlaytestCohortObjectSchema.parse(JSON.parse(playtestCohort))
    : undefined;
  const structuredRevisionBundle = revisionBundle
    ? RevisionBundleObjectSchema.parse(JSON.parse(revisionBundle))
    : undefined;
  const compiledRecipe = compileGameReviewRecipe(recipe, {
    subjectKind: parsed.subjectKind,
    selectedDomains,
  });
  return appendSerializedInput(compiledRecipe, {
    ...promptInput,
    ...(structuredProjectBrief
      ? {
          projectBrief: structuredProjectBrief,
          projectBriefDiagnostics,
        }
      : {}),
    ...(structuredRevisionBundle
      ? {
          revisionBundle: structuredRevisionBundle,
          ...(context.revisionBundleEvidence
            ? {
                revisionBundleEvidence: {
                  ...context.revisionBundleEvidence,
                  exactSaveRequired: true,
                },
              }
            : {}),
        }
      : {}),
    ...(structuredAuditSnapshotBundle
      ? {
          auditSnapshotBundle: structuredAuditSnapshotBundle,
          ...(context.auditSnapshotBundleEvidence
            ? {
                auditSnapshotBundleEvidence: {
                  ...context.auditSnapshotBundleEvidence,
                  exactSaveRequired: true,
                },
              }
            : {}),
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
    ...(context.reviewWorkflow
      ? {reviewWorkflow: context.reviewWorkflow}
      : {}),
    selectedDomains,
    missingChangeInputs,
    intakeDiagnostics,
  });
}

export function buildReviewChangePrompt(
  recipe: string,
  input: ReviewChangePromptArguments,
  context: GameReviewPromptContext = {},
): string {
  const parsed = ReviewChangePromptArgumentsSchema.parse(input);
  return buildGameReviewPrompt(recipe, {...parsed, mode: "change"}, {
    ...context,
    reviewWorkflow: "change",
  });
}

export function buildAuditProjectPrompt(
  recipe: string,
  input: AuditProjectPromptArguments,
  context: GameReviewPromptContext = {},
): string {
  const parsed = AuditProjectPromptArgumentsSchema.parse(input);
  return buildGameReviewPrompt(recipe, {...parsed, mode: "baseline"}, {
    ...context,
    reviewWorkflow: "audit",
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
