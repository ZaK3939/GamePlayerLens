import {z} from "zod";
import {canonicalSha256} from "./integrity.js";
import {
  GeneratedPersonaSchema,
  PersonaResearchQuestionSchema,
  PersonaSchema,
  PersonaSourceSelectionSchema,
  type GeneratedPersona,
  type Persona,
} from "./persona-schemas.js";
import type {StoredToolResult} from "./results.js";

const DerivationReviewSchema = z.object({
  sourceAppid: z.number().int().positive(),
  sourceRole: z.enum(["target", "competitor", "reference"]),
  recommendationId: z.string().min(1),
  review: z.string().min(1),
  votedUp: z.boolean(),
  language: z.string().min(1),
  matchedResearchQuestionIds: z.array(z.string().min(1)).min(1),
  matchedEvidenceSignals: z.array(z.string().min(1)).min(1),
}).passthrough();

const DerivationPayloadSchema = z.object({
  data: z.object({
    generationReadiness: z.object({
      generationAllowed: z.boolean(),
      supportedCount: z.number().int().nonnegative(),
    }).passthrough(),
    brief: z.object({
      market: z.string().min(1),
      language: z.string().min(1),
      researchQuestions: z.array(PersonaResearchQuestionSchema).min(1).max(3),
      sources: z.array(PersonaSourceSelectionSchema).min(1),
    }).passthrough(),
    reviews: z.array(DerivationReviewSchema),
  }).passthrough(),
  meta: z.object({
    observedAt: z.iso.datetime({offset: true}),
  }).passthrough(),
}).passthrough();

type DerivationPayload = z.infer<typeof DerivationPayloadSchema>;

function voiceKey(value: {source_appid: number; recommendation_id: string}): string {
  return `${value.source_appid}:${value.recommendation_id}`;
}

function assertPersonaMatchesPayload(
  persona: GeneratedPersona,
  payload: DerivationPayload,
): void {
  if (!payload.data.generationReadiness.generationAllowed) {
    throw new Error("persona derivation result does not allow generation");
  }
  if (payload.data.generationReadiness.supportedCount < 1) {
    throw new Error("persona derivation result supports no personas");
  }
  if (
    persona.target_context.market !== payload.data.brief.market
    || persona.target_context.language !== payload.data.brief.language
    || canonicalSha256(persona.target_context.research_questions)
      !== canonicalSha256(payload.data.brief.researchQuestions)
  ) {
    throw new Error("persona audience does not match the derivation result");
  }

  const sourceRoles = new Map(
    payload.data.brief.sources.map((source) => [source.appid, source]),
  );
  for (const source of persona.target_context.source_roles) {
    const selectedSource = sourceRoles.get(source.appid);
    if (!selectedSource || canonicalSha256(selectedSource) !== canonicalSha256(source)) {
      throw new Error(`persona source selection does not match derivation result: ${source.appid}`);
    }
  }

  const reviews = new Map(payload.data.reviews.map((review) => [
    `${review.sourceAppid}:${review.recommendationId}`,
    review,
  ]));
  for (const voice of persona.voice) {
    const review = reviews.get(voiceKey(voice));
    if (
      !review
      || review.review !== voice.text
      || review.language !== voice.language
      || review.votedUp !== voice.voted_up
      || review.sourceRole !== sourceRoles.get(voice.source_appid)?.role
    ) {
      throw new Error(
        `persona voice does not exactly match derivation review: ${voiceKey(voice)}`,
      );
    }
  }
  for (const pattern of persona.evidence_basis.observed_patterns) {
    for (const evidence of pattern.evidence) {
      const review = reviews.get(voiceKey(evidence));
      if (!review?.matchedResearchQuestionIds.includes(pattern.research_question_id)) {
        throw new Error(
          `persona pattern cites a review unrelated to its research question: ${voiceKey(evidence)}`,
        );
      }
    }
  }
}

export function groundPersonaFromResult(
  input: GeneratedPersona,
  result: StoredToolResult,
): Persona {
  const persona = GeneratedPersonaSchema.parse(input);
  if (result.sourceTool !== "derive_personas") {
    throw new Error("save_persona requires a derive_personas result handle");
  }
  const payload = DerivationPayloadSchema.parse(result.payload);
  if (payload.meta.observedAt !== result.observedAt) {
    throw new Error("persona derivation observedAt does not match its result handle");
  }
  assertPersonaMatchesPayload(persona, payload);
  return PersonaSchema.parse({
    ...persona,
    grounding: {
      sourceTool: "derive_personas",
      observedAt: result.observedAt,
      resultSha256: canonicalSha256(result.payload),
    },
  });
}

export function assertPersonaMatchesDerivationEvidence(
  persona: Persona,
  payloadInput: unknown,
): void {
  const payload = DerivationPayloadSchema.parse(payloadInput);
  if (persona.grounding.observedAt !== payload.meta.observedAt) {
    throw new Error(`persona derivation observedAt mismatch: ${persona.id}`);
  }
  if (persona.grounding.resultSha256 !== canonicalSha256(payloadInput)) {
    throw new Error(`persona derivation evidence hash mismatch: ${persona.id}`);
  }
  assertPersonaMatchesPayload(persona, payload);
}
