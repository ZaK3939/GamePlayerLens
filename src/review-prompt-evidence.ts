import type {ZodType} from "zod";
import {JsonValueSchema} from "./artifacts.js";
import {trackManualPromptEvidence} from "./mcp-responses.js";
import {
  ConceptTestObjectSchema,
  FirstContactTestObjectSchema,
  PlaytestCohortObjectSchema,
  PlaytestSessionObjectSchema,
} from "./playtest-evidence.js";
import {
  GameReviewPromptArgumentsSchema,
  type GameReviewPromptArguments,
  type GameReviewPromptContext,
} from "./prompts.js";
import {RevisionBundleObjectSchema} from "./revision-bundle.js";
import type {ResultStore} from "./results.js";

function trackSerializedEvidence<T>(
  store: ResultStore,
  serialized: string | undefined,
  schema: ZodType<T>,
  observedAt: (data: T) => string,
) {
  if (!serialized) return undefined;
  const data = schema.parse(JSON.parse(serialized));
  return trackManualPromptEvidence(store, {
    data: JsonValueSchema.parse(data),
    warnings: [],
    meta: {observedAt: observedAt(data)},
  });
}

export function trackReviewPromptEvidence(
  store: ResultStore,
  input: GameReviewPromptArguments,
): GameReviewPromptContext {
  const parsed = GameReviewPromptArgumentsSchema.parse(input);
  return {
    conceptTestEvidence: trackSerializedEvidence(
      store,
      parsed.conceptTest,
      ConceptTestObjectSchema,
      (data) => data.testedAt,
    ),
    firstContactTestEvidence: trackSerializedEvidence(
      store,
      parsed.firstContactTest,
      FirstContactTestObjectSchema,
      (data) => data.testedAt,
    ),
    playtestSessionEvidence: trackSerializedEvidence(
      store,
      parsed.playtestSession,
      PlaytestSessionObjectSchema,
      (data) => data.startedAt,
    ),
    playtestCohortEvidence: trackSerializedEvidence(
      store,
      parsed.playtestCohort,
      PlaytestCohortObjectSchema,
      (data) => data.sessions.reduce((latest, session) =>
        Date.parse(session.endedAt) > Date.parse(latest.endedAt) ? session : latest
      ).endedAt,
    ),
    revisionBundleEvidence: trackSerializedEvidence(
      store,
      parsed.revisionBundle,
      RevisionBundleObjectSchema,
      (data) => data.observedAt,
    ),
  };
}
