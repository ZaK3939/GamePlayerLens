import type {SourceTool} from "./artifacts.js";
import type {FetchResult} from "./http.js";
import type {ImageFetchResult} from "./images.js";
import {
  ResultEnvelopeSchema,
  ResultHandleSchema,
  type ResultEnvelope,
  type ResultStore,
} from "./results.js";

export function jsonEnvelope(result: FetchResult<unknown>) {
  const structuredContent = ResultEnvelopeSchema.parse(
    JSON.parse(JSON.stringify(result)) as unknown,
  );
  return {
    content: [{type: "text" as const, text: JSON.stringify(structuredContent)}],
    structuredContent,
  };
}

export function trackedJsonEnvelope(
  store: ResultStore,
  sourceTool: SourceTool,
  result: FetchResult<unknown>,
) {
  const normalized = ResultEnvelopeSchema.parse(
    JSON.parse(JSON.stringify(result)) as unknown,
  ) as ResultEnvelope;
  return jsonEnvelope(store.remember(sourceTool, normalized));
}

export function trackManualPromptEvidence(
  store: ResultStore,
  envelope: (ResultEnvelope & {meta: {observedAt: string}}) | undefined,
) {
  if (!envelope) return undefined;
  const tracked = store.remember("manual", envelope);
  return {
    sourceTool: "manual" as const,
    observedAt: envelope.meta.observedAt,
    resultHandle: ResultHandleSchema.parse(tracked.meta?.resultHandle),
  };
}

export function imageEnvelope(result: ImageFetchResult<unknown>) {
  const {imageContent, ...envelope} = result;
  const response = jsonEnvelope(envelope);
  return {
    ...response,
    content: imageContent
      ? [...response.content, imageContent]
      : response.content,
  };
}

export function workflowEnvelope(workflow: string, instructions: string) {
  const structuredContent = ResultEnvelopeSchema.parse({
    data: {workflow, instructions},
    warnings: [],
  });
  return {
    content: [{type: "text" as const, text: instructions}],
    structuredContent,
  };
}
