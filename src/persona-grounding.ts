import {z} from "zod";
import {canonicalSha256} from "./integrity.js";
import {
  GeneratedPersonaSchema,
  PersonaSchema,
  SourceRoleSchema,
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
      sources: z.array(SourceRoleSchema).min(1),
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
  ) {
    throw new Error("persona audience does not match the derivation result");
  }

  const sourceRoles = new Map(
    payload.data.brief.sources.map(({appid, role}) => [appid, role]),
  );
  for (const {appid, role} of persona.target_context.source_roles) {
    if (sourceRoles.get(appid) !== role) {
      throw new Error(`persona source role does not match derivation result: ${appid}`);
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
      || review.sourceRole !== sourceRoles.get(voice.source_appid)
    ) {
      throw new Error(
        `persona voice does not exactly match derivation review: ${voiceKey(voice)}`,
      );
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
