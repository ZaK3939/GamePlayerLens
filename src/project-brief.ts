import {z} from "zod";
import {addSafeSchemaIssues, RevisionIdSchema} from "./prompt-validation.js";

const ProjectBriefTextSchema = z.string().trim().min(1).max(2_000);
const ConceptOriginSchema = z.enum([
  "theme-first",
  "system-first",
  "holistic-image",
  "imitation",
]);
export const RewardFamilySchema = z.enum([
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
  primaryIntendedFeeling: ProjectBriefTextSchema.optional(),
  shortestRepeatableLoop: ProjectBriefTextSchema.optional(),
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
    "primaryIntendedFeeling",
    "shortestRepeatableLoop",
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
    "primaryIntendedFeeling",
    "shortestRepeatableLoop",
    "systemResponse",
    "rewardMechanisms",
    "oneSentencePromise",
    "coreProofMoment",
  ],
  "system-first": [
    "targetPlayer",
    "distinctiveSystem",
    "themeWorld",
    "primaryIntendedFeeling",
    "shortestRepeatableLoop",
    "systemResponse",
    "rewardMechanisms",
    "oneSentencePromise",
    "coreProofMoment",
  ],
  "holistic-image": [
    "targetPlayer",
    "themeWorld",
    "distinctiveSystem",
    "primaryIntendedFeeling",
    "shortestRepeatableLoop",
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
    "primaryIntendedFeeling",
    "shortestRepeatableLoop",
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
  "theme-first": "For this target player, which one primary feeling should the theme create, what is the shortest repeatable loop that creates it, and which observable moment proves it?",
  "system-first": "Which one primary feeling should this system create, which theme gives it emotional meaning, and what is the shortest repeatable loop that proves the fit?",
  "holistic-image": "Which one primary feeling, concrete theme, and shortest repeatable loop turn the broad image into an observable action-response-reward moment?",
  imitation: "What source action-response-reward mechanism matters, which one primary feeling should survive the transfer, and how does the target's shortest repeatable loop create a meaningful difference?",
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

export const ProjectBriefSchema = z.string().trim().min(2).max(20_000).transform(
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
export type SubjectKind = z.infer<typeof SubjectKindSchema>;
