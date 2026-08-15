import {constants, type Dirent, type Stats} from "node:fs";
import {
  link as nodeLink,
  lstat as nodeLstat,
  mkdir as nodeMkdir,
  open as nodeOpen,
  readdir as nodeReaddir,
  type FileHandle,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import {basename, dirname} from "node:path";
import {z} from "zod";
import {writeTextFileAtomically} from "./atomic-write.js";
import {isActualCalendarDate} from "./calendar-date.js";
import {assertCanonicalEvaluationMarkdown} from "./evaluation-markdown.js";
import {
  buildDeveloperDecisionSummary,
  type DeveloperDecisionSummary,
  extractDecisionCard,
  type StructuredDecisionCard,
} from "./evaluation-decision.js";
import {
  type FileAccessCoordinator,
  withFileAccess as coordinateFileAccess,
} from "./file-access.js";
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
  "steam_brief",
  "steam_discover",
  "steam_fetch",
  "steam_reviews",
  "steam_timeline",
  "steam_updates",
  "legal_source_plan",
  "derive_personas",
  "record_first_contact",
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

const CalendarDateSchema = z.string().refine(isActualCalendarDate, "invalid calendar date");
const IsoDateTimeSchema = z.iso.datetime({offset: true}).refine(
  (value) => isActualCalendarDate(value.slice(0, 10)),
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
  decisionCard: StructuredDecisionCard;
  developerSummary: DeveloperDecisionSummary;
  content: string;
}

export interface ArtifactFileOps {
  mkdir(path: string, options: {recursive: true}): Promise<string | undefined>;
  writeFile(
    path: string,
    data: string,
    options: {encoding: "utf8"; flag: "wx"; flush: true},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  open(path: string, flags: number): Promise<ArtifactFileHandle>;
  readdir(path: string, options: {withFileTypes: true}): Promise<Dirent[]>;
  lstat(path: string): Promise<Stats>;
}

interface ArtifactFileHandle {
  stat(): Promise<Stats>;
  readFile(options: {encoding: "utf8"}): Promise<string>;
  close(): Promise<void>;
}

const nodeFileOps: ArtifactFileOps = {
  mkdir: (path, options) => nodeMkdir(path, options),
  writeFile: (path, data, options) => nodeWriteFile(path, data, options),
  link: nodeLink,
  unlink: nodeUnlink,
  open: (path, flags) => nodeOpen(path, flags) as Promise<FileHandle>,
  readdir: (path, options) => nodeReaddir(path, options),
  lstat: nodeLstat,
};

export interface ArtifactStoreDependencies {
  clock?: () => Date;
  fileOps?: Partial<ArtifactFileOps>;
  withFileAccess?: FileAccessCoordinator;
}

export interface ArtifactStore {
  saveIntel(input: SaveIntelInput): Promise<IntelArtifactMetadata>;
  saveEvaluation(input: SaveEvaluationInput): Promise<EvaluationArtifactMetadata>;
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
  if (!match || !match[1] || !match[2] || !isActualCalendarDate(match[1])) {
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
  const withFileAccess = dependencies.withFileAccess ?? coordinateFileAccess;

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

  async function writeUnlocked(
    destination: string,
    data: string,
    artifactId: string,
  ): Promise<void> {
    await writeTextFileAtomically(destination, data, {
      fileOps: ops,
      alreadyExistsMessage: `artifact already exists: ${artifactId}`,
    });
  }

  async function atomicWrite(
    destination: string,
    data: string,
    artifactId: string,
  ): Promise<void> {
    await withFileAccess(
      destination,
      () => writeUnlocked(destination, data, artifactId),
    );
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
    return withFileAccess(path, async () => {
      let handle: ArtifactFileHandle;
      try {
        handle = await ops.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        if (isNodeError(error, "ELOOP")) {
          throw new Error("symlink artifacts are not allowed", {cause: error});
        }
        if (isNodeError(error, "ENOENT")) {
          throw new Error("artifact does not exist", {cause: error});
        }
        throw new Error("artifact could not be opened", {cause: error});
      }
      try {
        const stats = await handle.stat();
        if (stats.isSymbolicLink()) throw new Error("symlink artifacts are not allowed");
        if (!stats.isFile()) throw new Error("artifact is not a regular file");
        const raw = await handle.readFile({encoding: "utf8"});
        const finalStats = await handle.stat();
        if (
          finalStats.dev !== stats.dev
          || finalStats.ino !== stats.ino
          || finalStats.size !== stats.size
          || finalStats.mtimeMs !== stats.mtimeMs
          || Buffer.byteLength(raw, "utf8") !== stats.size
        ) {
          throw new Error("artifact changed while reading");
        }
        return {raw, stats};
      } catch (error) {
        if (error instanceof Error && !("code" in error)) throw error;
        throw new Error("artifact could not be read", {cause: error});
      } finally {
        await handle.close();
      }
    });
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
    assertCanonicalEvaluationMarkdown(raw);
    const decisionCard = extractDecisionCard(raw);
    return {
      metadata: evaluationMetadata(resolved, parsedId.date, stats),
      decisionCard,
      developerSummary: buildDeveloperDecisionSummary(decisionCard),
      content: raw,
    };
  }

  async function saveIntel(
    input: SaveIntelInput,
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
  ): Promise<EvaluationArtifactMetadata> {
    const parsed = SaveEvaluationInputSchema.parse(input);
    const sizeBytes = Buffer.byteLength(parsed.content, "utf8");
    if (sizeBytes > MAX_EVALUATION_BYTES) {
      throw new Error("evaluation Markdown exceeds 512 KiB");
    }
    assertCanonicalEvaluationMarkdown(parsed.content);
    let date = parsed.date;
    if (!date) {
      const current = clock();
      if (Number.isNaN(current.getTime())) throw new Error("clock returned an invalid date");
      date = current.toISOString().slice(0, 10);
    }
    const resolved = await ensureEvaluationDestination(parsed.target, date, parsed.topic);
    const stats = await withFileAccess(resolved.absolutePath, async () => {
      await writeUnlocked(
        resolved.absolutePath,
        parsed.content,
        `${date}-${resolved.topicId}`,
      );
      const savedStats = await ops.lstat(resolved.absolutePath);
      if (savedStats.isSymbolicLink() || !savedStats.isFile()) {
        throw new Error("saved evaluation is not a regular file");
      }
      return savedStats;
    });
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
