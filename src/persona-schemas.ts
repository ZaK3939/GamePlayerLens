import {z} from "zod";

export const MIN_UNIQUE_VOICE_REVIEWS_PER_PERSONA = 3;
export const MAX_DERIVATION_APPIDS = 12;
export const PERSONA_FOCUS_VALUES = [
  "adoption",
  "retention",
  "churn",
  "price",
  "localization",
  "update-response",
] as const;
export const PERSONA_MATCH_AXIS_VALUES = [
  "repeated-action",
  "decision-cadence",
  "system-response",
  "reward-structure",
  "player-problem",
  "session-shape",
  "platform-controls",
  "audience-expectation",
] as const;

const ResearchQuestionIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const EvidenceSignalSchema = z.string().trim().min(2).max(80);

export function normalizeEvidenceText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export const PersonaResearchQuestionSchema = z.object({
  id: ResearchQuestionIdSchema,
  question: z.string().trim().min(1).max(500),
  evidenceSignals: z.array(EvidenceSignalSchema).min(1).max(12).refine(
    (signals) => new Set(signals.map(normalizeEvidenceText)).size === signals.length,
    "evidenceSignals must be unique after normalization",
  ),
}).strict();

export const VoiceEvidenceSchema = z.object({
  text: z.string().min(1),
  source_appid: z.number().int().positive(),
  recommendation_id: z.string().min(1),
  language: z.string().min(1),
  voted_up: z.boolean(),
}).strict();

const SourceSelectionShape = {
  appid: z.number().int().positive(),
  researchQuestionIds: z.array(ResearchQuestionIdSchema).min(1).max(3).refine(
    (values) => new Set(values).size === values.length,
    "researchQuestionIds must be unique",
  ),
  rationale: z.string().trim().min(1).max(1_000),
};

function matchedAxesSchema(minimum: number) {
  return z.array(z.enum(PERSONA_MATCH_AXIS_VALUES))
    .min(minimum)
    .max(PERSONA_MATCH_AXIS_VALUES.length)
    .refine(
      (values) => new Set(values).size === values.length,
      "matchedAxes must be unique",
    );
}

export const PersonaSourceSelectionSchema = z.discriminatedUnion("role", [
  z.object({
    ...SourceSelectionShape,
    role: z.literal("target"),
    fitRole: z.literal("target-game"),
    matchedAxes: matchedAxesSchema(1),
  }).strict(),
  z.object({
    ...SourceSelectionShape,
    role: z.literal("competitor"),
    fitRole: z.enum(["direct-competitor", "adjacent-competitor"]),
    matchedAxes: matchedAxesSchema(3),
  }).strict(),
  z.object({
    ...SourceSelectionShape,
    role: z.literal("reference"),
    fitRole: z.literal("system-reference"),
    matchedAxes: matchedAxesSchema(1),
  }).strict(),
]);

export type PersonaSourceSelection = z.infer<typeof PersonaSourceSelectionSchema>;

const TargetContextSchema = z.object({
  market: z.string().trim().min(1).max(80),
  language: z.string().trim().min(1).max(32),
  research_questions: z.array(PersonaResearchQuestionSchema).min(1).max(3),
  source_roles: z.array(PersonaSourceSelectionSchema).min(1).max(MAX_DERIVATION_APPIDS),
}).strict();

const DecisionProfileSchema = z.object({
  adoption_trigger: z.string().trim().min(1).max(1_000),
  retention_trigger: z.string().trim().min(1).max(1_000),
  churn_trigger: z.string().trim().min(1).max(1_000),
  update_reaction: z.string().trim().min(1).max(1_000),
}).strict();

const VoiceReferenceSchema = z.object({
  source_appid: z.number().int().positive(),
  recommendation_id: z.string().min(1),
  relevance: z.string().trim().min(1).max(1_000),
}).strict();

const EvidenceBasisSchema = z.object({
  observed_patterns: z.array(z.object({
    research_question_id: ResearchQuestionIdSchema,
    claim: z.string().trim().min(1).max(1_000),
    evidence: z.array(VoiceReferenceSchema).min(1).max(5),
  }).strict()).min(2).max(8),
  inferred_traits: z.array(z.object({
    claim: z.string().trim().min(1).max(1_000),
    basis: z.string().trim().min(1).max(2_000),
    confidence: z.enum(["low", "medium", "high"]),
  }).strict()).max(8),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(8),
  overall_confidence: z.enum(["low", "medium", "high"]),
}).strict();

const PersonaGroundingSchema = z.object({
  sourceTool: z.literal("derive_personas"),
  observedAt: z.iso.datetime({offset: true}),
  resultSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const PersonaBaseShape = {
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  source_appids: z.array(z.number().int().positive()).min(1),
  archetype: z.string().min(1),
  playtime_profile: z.string().min(1),
  priorities: z.array(z.string().min(1)).min(1),
  voice: z.array(VoiceEvidenceSchema).min(MIN_UNIQUE_VOICE_REVIEWS_PER_PERSONA).max(5),
  dealbreakers: z.array(z.string().min(1)),
  price_sensitivity: z.string().min(1),
};

interface PersonaIssue {
  path: Array<string | number>;
  message: string;
}

function personaIssues(value: {
  source_appids: number[];
  voice: Array<{source_appid: number; recommendation_id: string}>;
  target_context: z.infer<typeof TargetContextSchema>;
  evidence_basis: z.infer<typeof EvidenceBasisSchema>;
}): PersonaIssue[] {
  const issues: PersonaIssue[] = [];
  const sourceAppids = new Set(value.source_appids);
  if (sourceAppids.size !== value.source_appids.length) {
    issues.push({path: ["source_appids"], message: "source_appids must be unique"});
  }
  const voiceKeys = new Set<string>();
  for (const [index, voice] of value.voice.entries()) {
    if (!sourceAppids.has(voice.source_appid)) {
      issues.push({
        path: ["voice", index, "source_appid"],
        message: "voice source_appid must be listed in source_appids",
      });
    }
    const key = `${voice.source_appid}:${voice.recommendation_id}`;
    if (voiceKeys.has(key)) {
      issues.push({
        path: ["voice", index, "recommendation_id"],
        message: "voice evidence references must be unique",
      });
    }
    voiceKeys.add(key);
  }

  const roleAppids = value.target_context.source_roles.map((source) => source.appid);
  if (new Set(roleAppids).size !== roleAppids.length) {
    issues.push({
      path: ["target_context", "source_roles"],
      message: "source role appids must be unique",
    });
  }
  const sameAppids = roleAppids.length === sourceAppids.size
    && roleAppids.every((appid) => sourceAppids.has(appid));
  if (!sameAppids) {
    issues.push({
      path: ["target_context", "source_roles"],
      message: "source roles must cover exactly source_appids",
    });
  }
  if (value.target_context.source_roles.filter((source) => source.role === "target").length > 1) {
    issues.push({
      path: ["target_context", "source_roles"],
      message: "at most one source appid may be the target",
    });
  }
  const researchQuestionIds = value.target_context.research_questions.map(({id}) => id);
  const uniqueResearchQuestionIds = new Set(researchQuestionIds);
  if (uniqueResearchQuestionIds.size !== researchQuestionIds.length) {
    issues.push({
      path: ["target_context", "research_questions"],
      message: "research question ids must be unique",
    });
  }
  for (const [sourceIndex, source] of value.target_context.source_roles.entries()) {
    for (const [questionIndex, questionId] of source.researchQuestionIds.entries()) {
      if (!uniqueResearchQuestionIds.has(questionId)) {
        issues.push({
          path: ["target_context", "source_roles", sourceIndex, "researchQuestionIds", questionIndex],
          message: "source researchQuestionIds must reference target research questions",
        });
      }
    }
  }
  const sourceByAppid = new Map(
    value.target_context.source_roles.map((source) => [source.appid, source]),
  );
  const usedVoiceKeys = new Set<string>();
  for (const [patternIndex, pattern] of value.evidence_basis.observed_patterns.entries()) {
    if (!uniqueResearchQuestionIds.has(pattern.research_question_id)) {
      issues.push({
        path: ["evidence_basis", "observed_patterns", patternIndex, "research_question_id"],
        message: "observed pattern must reference a target research question",
      });
    }
    for (const [evidenceIndex, evidence] of pattern.evidence.entries()) {
      const key = `${evidence.source_appid}:${evidence.recommendation_id}`;
      if (!voiceKeys.has(key)) {
        issues.push({
          path: ["evidence_basis", "observed_patterns", patternIndex, "evidence", evidenceIndex],
          message: "observed pattern evidence must reference persona voice",
        });
      }
      usedVoiceKeys.add(key);
      if (!sourceByAppid.get(evidence.source_appid)?.researchQuestionIds.includes(
        pattern.research_question_id,
      )) {
        issues.push({
          path: ["evidence_basis", "observed_patterns", patternIndex, "evidence", evidenceIndex],
          message: "voice source is not selected for the observed pattern research question",
        });
      }
    }
  }
  for (const [voiceIndex, voice] of value.voice.entries()) {
    if (!usedVoiceKeys.has(`${voice.source_appid}:${voice.recommendation_id}`)) {
      issues.push({
        path: ["voice", voiceIndex],
        message: "every persona voice must support an observed pattern",
      });
    }
  }
  return issues;
}

function addPersonaIssues(
  value: Parameters<typeof personaIssues>[0],
  context: {addIssue(issue: {code: "custom"; path: Array<string | number>; message: string}): void},
): void {
  for (const issue of personaIssues(value)) context.addIssue({code: "custom", ...issue});
}

export const GeneratedPersonaSchema = z.object({
  ...PersonaBaseShape,
  schema_version: z.literal(3),
  target_context: TargetContextSchema,
  decision_profile: DecisionProfileSchema,
  evidence_basis: EvidenceBasisSchema,
}).strict().superRefine(addPersonaIssues);

export const PersonaSchema = z.object({
  ...PersonaBaseShape,
  schema_version: z.literal(3),
  target_context: TargetContextSchema,
  decision_profile: DecisionProfileSchema,
  evidence_basis: EvidenceBasisSchema,
  grounding: PersonaGroundingSchema,
}).strict().superRefine(addPersonaIssues);

export type Persona = z.infer<typeof PersonaSchema>;
export type GeneratedPersona = z.infer<typeof GeneratedPersonaSchema>;

export type PersonaFocus = typeof PERSONA_FOCUS_VALUES[number];
export type PersonaResearchQuestion = z.infer<typeof PersonaResearchQuestionSchema>;
