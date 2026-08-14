import {randomUUID} from "node:crypto";
import {z} from "zod";
import {
  JsonValueSchema,
  MAX_INTEL_PAYLOAD_BYTES,
  SourceToolSchema,
  type SourceTool,
} from "./artifacts.js";
import type {JsonValue} from "./http.js";

export const MAX_TRACKED_RESULTS = 32;
export const ResultHandleSchema = z.uuid();

const ObservedAtSchema = z.iso.datetime({offset: true});
export const ResultEnvelopeSchema = z.object({
  data: JsonValueSchema,
  warnings: z.array(z.string()),
  meta: z.record(z.string(), JsonValueSchema).optional(),
}).strict();

export type ResultEnvelope = z.infer<typeof ResultEnvelopeSchema>;

export interface StoredToolResult {
  sourceTool: SourceTool;
  observedAt: string;
  payload: JsonValue;
}

export interface ResultStore {
  remember(sourceTool: SourceTool, result: ResultEnvelope): ResultEnvelope;
  get(handle: string): StoredToolResult;
}

export interface ResultStoreOptions {
  capacity?: number;
  idFactory?: () => string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createResultStore(
  options: ResultStoreOptions = {},
): ResultStore {
  const capacity = options.capacity ?? MAX_TRACKED_RESULTS;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new TypeError("result store capacity must be a positive integer");
  }
  const idFactory = options.idFactory ?? randomUUID;
  const entries = new Map<string, StoredToolResult>();

  function remember(sourceTool: SourceTool, result: ResultEnvelope): ResultEnvelope {
    const normalized = ResultEnvelopeSchema.parse(clone(result));
    const observedAt = normalized.meta?.observedAt;
    if (observedAt === undefined) {
      return normalized;
    }
    if (typeof observedAt !== "string" || !ObservedAtSchema.safeParse(observedAt).success) {
      return {
        ...normalized,
        warnings: [
          ...normalized.warnings,
          "exact result persistence unavailable: tool result has an invalid observedAt",
        ],
      };
    }

    SourceToolSchema.parse(sourceTool);
    const handle = ResultHandleSchema.parse(idFactory());
    if (entries.has(handle)) throw new Error("result handle collision");
    const tracked = ResultEnvelopeSchema.parse({
      ...normalized,
      meta: {...normalized.meta, resultHandle: handle},
    });
    const payload = clone(tracked) as JsonValue;
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_INTEL_PAYLOAD_BYTES) {
      return {
        ...normalized,
        warnings: [
          ...normalized.warnings,
          "exact result persistence unavailable: tool result exceeds 1 MiB; reduce the requested evidence size",
        ],
      };
    }

    if (entries.size >= capacity) {
      const oldest = entries.keys().next().value as string | undefined;
      if (oldest) entries.delete(oldest);
    }
    entries.set(handle, {sourceTool, observedAt, payload});
    return tracked;
  }

  function get(handle: string): StoredToolResult {
    ResultHandleSchema.parse(handle);
    const entry = entries.get(handle);
    if (!entry) throw new Error("result handle is unknown or expired");
    return clone(entry);
  }

  return {remember, get};
}
