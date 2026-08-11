import {randomUUID} from "node:crypto";
import type {Dirent, Stats} from "node:fs";
import {
  link as nodeLink,
  lstat as nodeLstat,
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  readdir as nodeReaddir,
  rename as nodeRename,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import {z} from "zod";
import type {JsonValue} from "./http.js";
import type {
  PathResolver,
  ResolvedEvaluationPath,
  ResolvedIntelArtifactPath,
} from "./paths.js";

export const MAX_INTEL_PAYLOAD_BYTES = 1024 * 1024;
export const MAX_EVALUATION_BYTES = 512 * 1024;

export const ArtifactKindSchema = z.enum(["intel", "evaluation"]);
export const ImageArtifactKindSchema = z.enum(["capture", "ui-reference"]);
export const RunArtifactKindSchema = z.literal("run");
export const AnyArtifactKindSchema = z.union([
  ArtifactKindSchema,
  ImageArtifactKindSchema,
  RunArtifactKindSchema,
]);
export const SourceToolSchema = z.enum([
  "steam_search",
  "steam_discover",
  "steam_fetch",
  "steam_reviews",
  "steam_timeline",
  "steam_updates",
  "derive_personas",
  "ui_capture",
  "manual",
]);

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type ImageArtifactKind = z.infer<typeof ImageArtifactKindSchema>;
export type RunArtifactKind = z.infer<typeof RunArtifactKindSchema>;
export type AnyArtifactKind = z.infer<typeof AnyArtifactKindSchema>;
export type SourceTool = z.infer<typeof SourceToolSchema>;

const CanonicalIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u);

function isActualDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

const CalendarDateSchema = z.string().refine(isActualDate, "invalid calendar date");
const IsoDateTimeSchema = z.iso.datetime({offset: true}).refine(
  (value) => isActualDate(value.slice(0, 10)),
  "invalid ISO date-time",
);

function isJsonSafe(value: unknown, ancestors = new WeakSet<object>()): value is JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const ownNames = Object.getOwnPropertyNames(value);
      if (
        ownNames.length !== value.length + 1
        || ownNames.some((key) => key !== "length" && !/^(0|[1-9]\d*)$/.test(key))
      ) {
        return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          !descriptor
          || !descriptor.enumerable
          || !("value" in descriptor)
          || !isJsonSafe(descriptor.value, ancestors)
        ) {
          return false;
        }
      }
      return true;
    }
    return Object.getOwnPropertyNames(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(
        descriptor
        && descriptor.enumerable
        && "value" in descriptor
        && isJsonSafe(descriptor.value, ancestors),
      );
    });
  } finally {
    ancestors.delete(value);
  }
}

const JsonSafeInputSchema = z.custom<JsonValue>(isJsonSafe, {
  message: "payload must be JSON-safe",
});

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema),
]));

export const SaveIntelInputSchema = z.object({
  target: z.string().min(1),
  id: z.string().min(1),
  sourceTool: SourceToolSchema,
  observedAt: IsoDateTimeSchema.optional(),
  payload: JsonSafeInputSchema,
}).strict();

export const SaveEvaluationInputSchema = z.object({
  target: z.string().min(1),
  topic: z.string().min(1),
  date: CalendarDateSchema.optional(),
  content: z.string().min(1),
}).strict();

export const IntelRecordSchema = z.object({
  schemaVersion: z.literal(1),
  targetId: CanonicalIdSchema,
  artifactId: CanonicalIdSchema,
  sourceTool: SourceToolSchema,
  observedAt: IsoDateTimeSchema,
  savedAt: IsoDateTimeSchema,
  payload: JsonValueSchema,
}).strict();

export const IntelArtifactMetadataSchema = z.object({
  path: z.string().min(1),
  targetId: CanonicalIdSchema,
  id: CanonicalIdSchema,
  artifactId: CanonicalIdSchema,
  sourceTool: SourceToolSchema,
  observedAt: IsoDateTimeSchema,
  savedAt: IsoDateTimeSchema,
  sizeBytes: z.number().int().nonnegative(),
}).strict();

export const EvaluationArtifactMetadataSchema = z.object({
  path: z.string().min(1),
  targetId: CanonicalIdSchema,
  id: z.string().min(12).max(75),
  date: CalendarDateSchema,
  topicId: CanonicalIdSchema,
  savedAt: IsoDateTimeSchema,
  sizeBytes: z.number().int().nonnegative(),
}).strict();

export const ArtifactMetadataSchema = z.union([
  IntelArtifactMetadataSchema,
  EvaluationArtifactMetadataSchema,
]);

export type SaveIntelInput = z.infer<typeof SaveIntelInputSchema>;
export type SaveEvaluationInput = z.infer<typeof SaveEvaluationInputSchema>;
export type IntelRecord = z.infer<typeof IntelRecordSchema>;
export type IntelArtifactMetadata = z.infer<typeof IntelArtifactMetadataSchema>;
export type EvaluationArtifactMetadata = z.infer<typeof EvaluationArtifactMetadataSchema>;
export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

export interface EvaluationArtifact {
  metadata: EvaluationArtifactMetadata;
  content: string;
}

export interface ArtifactFileOps {
  mkdir(path: string, options: {recursive: true}): Promise<string | undefined>;
  writeFile(
    path: string,
    data: string,
    options: {encoding: "utf8"; flag: "wx"},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readdir(path: string, options: {withFileTypes: true}): Promise<Dirent[]>;
  lstat(path: string): Promise<Stats>;
}

const nodeFileOps: ArtifactFileOps = {
  mkdir: (path, options) => nodeMkdir(path, options),
  writeFile: (path, data, options) => nodeWriteFile(path, data, options),
  link: nodeLink,
  rename: nodeRename,
  unlink: nodeUnlink,
  readFile: nodeReadFile,
  readdir: (path, options) => nodeReaddir(path, options),
  lstat: nodeLstat,
};

export interface ArtifactStoreDependencies {
  clock?: () => Date;
  fileOps?: Partial<ArtifactFileOps>;
}

export type OverwriteOption = boolean | {overwrite?: boolean};

export interface ArtifactStore {
  saveIntel(
    input: SaveIntelInput,
    overwrite?: OverwriteOption,
  ): Promise<IntelArtifactMetadata>;
  saveEvaluation(
    input: SaveEvaluationInput,
    overwrite?: OverwriteOption,
  ): Promise<EvaluationArtifactMetadata>;
  listTargets(kind: ArtifactKind): Promise<string[]>;
  listArtifacts(kind: "intel", target: string): Promise<IntelArtifactMetadata[]>;
  listArtifacts(
    kind: "evaluation",
    target: string,
  ): Promise<EvaluationArtifactMetadata[]>;
  listArtifacts(kind: ArtifactKind, target: string): Promise<ArtifactMetadata[]>;
  readIntel(target: string, id: string): Promise<IntelRecord>;
  readEvaluation(target: string, id: string): Promise<EvaluationArtifact>;
}

export class ArtifactSchemaError extends Error {
  override name = "ArtifactSchemaError";
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function overwriteEnabled(option: OverwriteOption | undefined): boolean {
  return option === true || (typeof option === "object" && option.overwrite === true);
}

function payloadSize(payload: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

function intelMetadata(
  record: IntelRecord,
  path: string,
  sizeBytes: number,
): IntelArtifactMetadata {
  return IntelArtifactMetadataSchema.parse({
    path,
    targetId: record.targetId,
    id: record.artifactId,
    artifactId: record.artifactId,
    sourceTool: record.sourceTool,
    observedAt: record.observedAt,
    savedAt: record.savedAt,
    sizeBytes,
  });
}

function evaluationMetadata(
  resolved: ResolvedEvaluationPath,
  date: string,
  stats: Stats,
): EvaluationArtifactMetadata {
  return EvaluationArtifactMetadataSchema.parse({
    path: resolved.relativePath,
    targetId: resolved.targetId,
    id: `${date}-${resolved.topicId}`,
    date,
    topicId: resolved.topicId,
    savedAt: stats.mtime.toISOString(),
    sizeBytes: stats.size,
  });
}

function evaluationId(id: string): {date: string; topic: string} {
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(id);
  if (!match || !match[1] || !match[2] || !isActualDate(match[1])) {
    throw new Error("invalid evaluation artifact id");
  }
  return {date: match[1], topic: match[2]};
}

export function createArtifactStore(
  resolver: Pick<
    PathResolver,
    "root" | "resolveIntelArtifactPath" | "resolveEvaluationPath"
  >,
  dependencies: ArtifactStoreDependencies = {},
): ArtifactStore {
  const clock = dependencies.clock ?? (() => new Date());
  const ops = {...nodeFileOps, ...dependencies.fileOps};

  function resolveProbe(kind: ArtifactKind): ResolvedIntelArtifactPath | ResolvedEvaluationPath {
    return kind === "intel"
      ? resolver.resolveIntelArtifactPath("artifact-list-probe", "artifact-list-probe")
      : resolver.resolveEvaluationPath(
        "artifact-list-probe",
        "2000-01-01",
        "artifact-list-probe",
      );
  }

  function rootDirectory(kind: ArtifactKind): string {
    return dirname(dirname(resolveProbe(kind).absolutePath));
  }

  function targetDirectory(kind: ArtifactKind, target: string): {path: string; targetId: string} {
    const resolved = kind === "intel"
      ? resolver.resolveIntelArtifactPath(target, "artifact-list-probe")
      : resolver.resolveEvaluationPath(target, "2000-01-01", "artifact-list-probe");
    return {path: dirname(resolved.absolutePath), targetId: resolved.targetId};
  }

  async function atomicWrite(
    destination: string,
    data: string,
    overwrite: boolean,
    artifactId: string,
  ): Promise<void> {
    const temporary = join(
      dirname(destination),
      `.${basename(destination)}.${randomUUID()}.tmp`,
    );
    let failed = false;

    try {
      await ops.writeFile(temporary, data, {encoding: "utf8", flag: "wx"});
      if (overwrite) {
        await ops.rename(temporary, destination);
      } else {
        try {
          await ops.link(temporary, destination);
        } catch (error) {
          if (isNodeError(error, "EEXIST")) {
            throw new Error(`artifact already exists: ${artifactId}`);
          }
          throw error;
        }
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try {
        await ops.unlink(temporary);
      } catch (error) {
        if (!isNodeError(error, "ENOENT") && !failed) throw error;
      }
    }
  }

  async function ensureIntelDestination(
    target: string,
    id: string,
  ): Promise<ResolvedIntelArtifactPath> {
    const initial = resolver.resolveIntelArtifactPath(target, id);
    await ops.mkdir(dirname(initial.absolutePath), {recursive: true});
    const verified = resolver.resolveIntelArtifactPath(target, id);
    if (verified.absolutePath !== initial.absolutePath) {
      throw new Error("artifact destination changed during creation");
    }
    return verified;
  }

  async function ensureEvaluationDestination(
    target: string,
    date: string,
    topic: string,
  ): Promise<ResolvedEvaluationPath> {
    const initial = resolver.resolveEvaluationPath(target, date, topic);
    await ops.mkdir(dirname(initial.absolutePath), {recursive: true});
    const verified = resolver.resolveEvaluationPath(target, date, topic);
    if (verified.absolutePath !== initial.absolutePath) {
      throw new Error("artifact destination changed during creation");
    }
    return verified;
  }

  async function readRegularFile(path: string): Promise<{raw: string; stats: Stats}> {
    const stats = await ops.lstat(path);
    if (stats.isSymbolicLink()) throw new Error("symlink artifacts are not allowed");
    if (!stats.isFile()) throw new Error("artifact is not a regular file");
    return {raw: await ops.readFile(path, "utf8"), stats};
  }

  function parseIntelRecord(
    raw: string,
    expected: ResolvedIntelArtifactPath,
  ): IntelRecord {
    try {
      const parsed = IntelRecordSchema.parse(JSON.parse(raw) as unknown);
      if (
        parsed.targetId !== expected.targetId
        || parsed.artifactId !== expected.artifactId
        || payloadSize(parsed.payload) > MAX_INTEL_PAYLOAD_BYTES
      ) {
        throw new Error("record does not match its artifact path");
      }
      return parsed;
    } catch (error) {
      throw new ArtifactSchemaError(
        `invalid intel schema at ${expected.relativePath}`,
        {cause: error},
      );
    }
  }

  async function readIntelWithMetadata(
    target: string,
    id: string,
  ): Promise<{record: IntelRecord; metadata: IntelArtifactMetadata}> {
    const resolved = resolver.resolveIntelArtifactPath(target, id);
    const {raw, stats} = await readRegularFile(resolved.absolutePath);
    const record = parseIntelRecord(raw, resolved);
    return {
      record,
      metadata: intelMetadata(record, resolved.relativePath, stats.size),
    };
  }

  async function readEvaluationArtifact(target: string, id: string): Promise<EvaluationArtifact> {
    const parsedId = evaluationId(id);
    const resolved = resolver.resolveEvaluationPath(target, parsedId.date, parsedId.topic);
    const {raw, stats} = await readRegularFile(resolved.absolutePath);
    const sizeBytes = Buffer.byteLength(raw, "utf8");
    if (sizeBytes < 1 || sizeBytes > MAX_EVALUATION_BYTES || stats.size !== sizeBytes) {
      throw new ArtifactSchemaError(`invalid evaluation artifact at ${resolved.relativePath}`);
    }
    return {
      metadata: evaluationMetadata(resolved, parsedId.date, stats),
      content: raw,
    };
  }

  async function saveIntel(
    input: SaveIntelInput,
    overwrite?: OverwriteOption,
  ): Promise<IntelArtifactMetadata> {
    const parsed = SaveIntelInputSchema.parse(input);
    const serializedPayloadBytes = payloadSize(parsed.payload);
    if (serializedPayloadBytes > MAX_INTEL_PAYLOAD_BYTES) {
      throw new Error("intel serialized payload exceeds 1 MiB");
    }
    const savedAt = clock().toISOString();
    IsoDateTimeSchema.parse(savedAt);
    const observedAt = parsed.observedAt ?? savedAt;
    const resolved = await ensureIntelDestination(parsed.target, parsed.id);
    const record = IntelRecordSchema.parse({
      schemaVersion: 1,
      targetId: resolved.targetId,
      artifactId: resolved.artifactId,
      sourceTool: parsed.sourceTool,
      observedAt,
      savedAt,
      payload: parsed.payload,
    });
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    await atomicWrite(
      resolved.absolutePath,
      serialized,
      overwriteEnabled(overwrite),
      resolved.artifactId,
    );
    return intelMetadata(
      record,
      resolved.relativePath,
      Buffer.byteLength(serialized, "utf8"),
    );
  }

  async function saveEvaluation(
    input: SaveEvaluationInput,
    overwrite?: OverwriteOption,
  ): Promise<EvaluationArtifactMetadata> {
    const parsed = SaveEvaluationInputSchema.parse(input);
    const sizeBytes = Buffer.byteLength(parsed.content, "utf8");
    if (sizeBytes > MAX_EVALUATION_BYTES) {
      throw new Error("evaluation Markdown exceeds 512 KiB");
    }
    let date = parsed.date;
    if (!date) {
      const current = clock();
      if (Number.isNaN(current.getTime())) throw new Error("clock returned an invalid date");
      date = current.toISOString().slice(0, 10);
    }
    const resolved = await ensureEvaluationDestination(parsed.target, date, parsed.topic);
    await atomicWrite(
      resolved.absolutePath,
      parsed.content,
      overwriteEnabled(overwrite),
      `${date}-${resolved.topicId}`,
    );
    const stats = await ops.lstat(resolved.absolutePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("saved evaluation is not a regular file");
    }
    return evaluationMetadata(resolved, date, stats);
  }

  async function listTargets(kind: ArtifactKind): Promise<string[]> {
    ArtifactKindSchema.parse(kind);
    const entries = await ops.readdir(rootDirectory(kind), {withFileTypes: true});
    const targets: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || (kind === "intel" && entry.name === "captures")) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`symlink artifact target is not allowed: ${entry.name}`);
      }
      if (!entry.isDirectory()) continue;
      if (!CanonicalIdSchema.safeParse(entry.name).success) continue;
      const resolved = targetDirectory(kind, entry.name);
      if (resolved.targetId === entry.name) targets.push(entry.name);
    }
    return targets.sort((left, right) => left.localeCompare(right));
  }

  async function directoryEntries(kind: ArtifactKind, target: string): Promise<Dirent[]> {
    const directory = targetDirectory(kind, target).path;
    try {
      return await ops.readdir(directory, {withFileTypes: true});
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return [];
      throw error;
    }
  }

  async function listIntelArtifacts(target: string): Promise<IntelArtifactMetadata[]> {
    const entries = await directoryEntries("intel", target);
    const metadata: IntelArtifactMetadata[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || !entry.name.endsWith(".json")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink artifacts are not allowed");
      if (!entry.isFile()) continue;
      const id = entry.name.slice(0, -5);
      const resolved = resolver.resolveIntelArtifactPath(target, id);
      if (resolved.artifactId !== id || basename(resolved.absolutePath) !== entry.name) continue;
      metadata.push((await readIntelWithMetadata(target, id)).metadata);
    }
    return metadata.sort((left, right) => left.id.localeCompare(right.id));
  }

  async function listEvaluationArtifacts(
    target: string,
  ): Promise<EvaluationArtifactMetadata[]> {
    const entries = await directoryEntries("evaluation", target);
    const metadata: EvaluationArtifactMetadata[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || !entry.name.endsWith(".md")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink artifacts are not allowed");
      if (!entry.isFile()) continue;
      const id = entry.name.slice(0, -3);
      let parsedId: {date: string; topic: string};
      try {
        parsedId = evaluationId(id);
      } catch {
        continue;
      }
      const resolved = resolver.resolveEvaluationPath(target, parsedId.date, parsedId.topic);
      if (`${parsedId.date}-${resolved.topicId}` !== id) continue;
      metadata.push((await readEvaluationArtifact(target, id)).metadata);
    }
    return metadata.sort((left, right) =>
      right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
  }

  function listArtifacts(
    kind: "intel",
    target: string,
  ): Promise<IntelArtifactMetadata[]>;
  function listArtifacts(
    kind: "evaluation",
    target: string,
  ): Promise<EvaluationArtifactMetadata[]>;
  function listArtifacts(kind: ArtifactKind, target: string): Promise<ArtifactMetadata[]>;
  function listArtifacts(
    kind: ArtifactKind,
    target: string,
  ): Promise<IntelArtifactMetadata[] | EvaluationArtifactMetadata[]> {
    ArtifactKindSchema.parse(kind);
    return kind === "intel"
      ? listIntelArtifacts(target)
      : listEvaluationArtifacts(target);
  }

  return {
    saveIntel,
    saveEvaluation,
    listTargets,
    listArtifacts,
    readIntel: async (target, id) => (await readIntelWithMetadata(target, id)).record,
    readEvaluation: readEvaluationArtifact,
  };
}
