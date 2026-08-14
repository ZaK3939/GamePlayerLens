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

export const VoiceEvidenceSchema = z.object({
  text: z.string().min(1),
  source_appid: z.number().int().positive(),
  recommendation_id: z.string().min(1),
  language: z.string().min(1),
  voted_up: z.boolean(),
}).strict();

export const SourceRoleSchema = z.object({
  appid: z.number().int().positive(),
  role: z.enum(["target", "competitor", "reference"]),
}).strict();

export type PersonaSourceRole = z.infer<typeof SourceRoleSchema>;

const TargetContextSchema = z.object({
  market: z.string().trim().min(1).max(80),
  language: z.string().trim().min(1).max(32),
  source_roles: z.array(SourceRoleSchema).min(1).max(MAX_DERIVATION_APPIDS),
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
}).strict();

const EvidenceBasisSchema = z.object({
  observed_patterns: z.array(z.object({
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
  schema_version?: 2;
  target_context?: z.infer<typeof TargetContextSchema>;
  decision_profile?: z.infer<typeof DecisionProfileSchema>;
  evidence_basis?: z.infer<typeof EvidenceBasisSchema>;
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

  const hasV2 = value.schema_version !== undefined
    || value.target_context !== undefined
    || value.decision_profile !== undefined
    || value.evidence_basis !== undefined;
  if (!hasV2) return issues;
  if (value.schema_version !== 2) {
    issues.push({path: ["schema_version"], message: "v2 persona requires schema_version 2"});
  }
  for (const field of ["target_context", "decision_profile", "evidence_basis"] as const) {
    if (value[field] === undefined) {
      issues.push({path: [field], message: `v2 persona requires ${field}`});
    }
  }
  if (value.target_context) {
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
  }
  for (const [patternIndex, pattern] of (value.evidence_basis?.observed_patterns ?? []).entries()) {
    for (const [evidenceIndex, evidence] of pattern.evidence.entries()) {
      if (!voiceKeys.has(`${evidence.source_appid}:${evidence.recommendation_id}`)) {
        issues.push({
          path: ["evidence_basis", "observed_patterns", patternIndex, "evidence", evidenceIndex],
          message: "observed pattern evidence must reference persona voice",
        });
      }
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

export const PersonaSchema = z.object({
  ...PersonaBaseShape,
  schema_version: z.literal(2).optional(),
  target_context: TargetContextSchema.optional(),
  decision_profile: DecisionProfileSchema.optional(),
  evidence_basis: EvidenceBasisSchema.optional(),
}).strict().superRefine(addPersonaIssues);

export const GeneratedPersonaSchema = z.object({
  ...PersonaBaseShape,
  schema_version: z.literal(2),
  target_context: TargetContextSchema,
  decision_profile: DecisionProfileSchema,
  evidence_basis: EvidenceBasisSchema,
}).strict().superRefine(addPersonaIssues);

export type Persona = z.infer<typeof PersonaSchema>;

export type PersonaFocus = typeof PERSONA_FOCUS_VALUES[number];

