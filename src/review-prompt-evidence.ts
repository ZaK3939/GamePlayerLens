import type {ZodType} from "zod";
import {AuditSnapshotBundleObjectSchema} from "./audit-snapshot.js";
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
import {ResultEnvelopeSchema} from "./results.js";

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

function resolveFirstContactEvidence(
  store: ResultStore,
  handle: string | undefined,
) {
  if (!handle) return {};
  const stored = store.get(handle);
  if (stored.sourceTool !== "record_first_contact") {
    throw new Error("firstContactResultHandle must come from record_first_contact");
  }
  const envelope = ResultEnvelopeSchema.parse(stored.payload);
  const data = FirstContactTestObjectSchema.parse(envelope.data);
  if (stored.observedAt !== data.testedAt) {
    throw new Error("first-contact result observedAt does not match testedAt");
  }
  return {
    firstContactTest: data,
    firstContactTestEvidence: {
      sourceTool: "record_first_contact" as const,
      observedAt: stored.observedAt,
      resultHandle: handle,
    },
  };
}

export function trackReviewPromptEvidence(
  store: ResultStore,
  input: GameReviewPromptArguments,
): GameReviewPromptContext {
  const parsed = GameReviewPromptArgumentsSchema.parse(input);
  return {
    ...resolveFirstContactEvidence(store, parsed.firstContactResultHandle),
    conceptTestEvidence: trackSerializedEvidence(
      store,
      parsed.conceptTest,
      ConceptTestObjectSchema,
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
    auditSnapshotBundleEvidence: trackSerializedEvidence(
      store,
      parsed.auditSnapshotBundle,
      AuditSnapshotBundleObjectSchema,
      (data) => data.observedAt,
    ),
  };
}
