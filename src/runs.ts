import {createHash, randomUUID} from "node:crypto";
import {constants, type Dirent, type Stats} from "node:fs";
import {
  link as nodeLink,
  mkdir as nodeMkdir,
  open as nodeOpen,
  readdir as nodeReaddir,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile,
  type FileHandle,
} from "node:fs/promises";
import {basename, dirname, relative, sep} from "node:path";
import {z} from "zod";
import {
  IntelRecordSchema,
  MAX_EVALUATION_BYTES,
  MAX_INTEL_PAYLOAD_BYTES,
} from "./artifacts.js";
import {MAX_INLINE_IMAGE_BYTES} from "./images.js";
import {PersonaSchema} from "./personas.js";
import type {
  PathResolver,
  ResolvedImagePath,
  ResolvedRunPath,
} from "./paths.js";

export const MAX_RUN_BYTES = 2 * 1024 * 1024;
const MAX_PERSONA_BYTES = 512 * 1024;
const MAX_RECIPE_BYTES = 512 * 1024;
const MAX_STORED_INTEL_BYTES = 4 * MAX_INTEL_PAYLOAD_BYTES;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RUN_RECIPE_ID = "run-sim.md";

export const RunIdSchema = z.uuid();
export const SimulationModeSchema = z.enum(["baseline", "change"]);
export const SimulationDomainSchema = z.enum([
  "gameplay",
  "storefront",
  "ui",
  "price",
  "localization",
  "competition",
]);
const ReferenceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const CanonicalTargetIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoDateTimeSchema = z.iso.datetime({offset: true});

const ModelInputSchema = z.object({
  provider: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(120).optional(),
}).strict();

const ScenarioSchema = z.object({
  id: ReferenceIdSchema,
  label: z.string().trim().min(1).max(120),
  specification: z.string().min(1).max(50_000),
}).strict();

const EvidenceReferenceInputSchema = z.discriminatedUnion("kind", [
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("intel"),
    target: z.string().min(1),
    id: z.string().min(1),
  }).strict(),
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("evaluation"),
    target: z.string().min(1),
    id: z.string().min(1),
  }).strict(),
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("capture"),
    id: z.string().min(1),
  }).strict(),
  z.object({
    ref: ReferenceIdSchema,
    kind: z.literal("ui-reference"),
    id: z.string().min(1),
  }).strict(),
]);

const SimulationRoundSchema = z.object({
  sequence: z.number().int().positive().max(1_000),
  phase: z.enum(["persona", "domain", "critic", "synthesis"]),
  actor: z.string().trim().min(1).max(120),
  scenarioId: ReferenceIdSchema.optional(),
  domain: SimulationDomainSchema.optional(),
  personaId: ReferenceIdSchema.optional(),
  output: z.string().min(1).max(100_000),
  evidenceRefs: z.array(ReferenceIdSchema).min(1).max(50),
}).strict();

const ConfidenceInputSchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  basis: z.string().trim().min(1).max(4_000),
  calibrationStatus: z.enum([
    "not-calibrated",
    "partially-calibrated",
    "calibrated",
  ]),
}).strict();

interface RelationShape {
  mode: z.infer<typeof SimulationModeSchema>;
  selectedDomains: Array<z.infer<typeof SimulationDomainSchema>>;
  scenarios: Array<z.infer<typeof ScenarioSchema>>;
  personaIds: string[];
  evidenceRefs: Array<{ref: string; kind: string}>;
  rounds: Array<z.infer<typeof SimulationRoundSchema>>;
  finalEvaluationRef: string;
}

function duplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function validateRelations(
  value: RelationShape,
  context: z.RefinementCtx,
): void {
  const issue = (path: Array<string | number>, message: string) => {
    context.addIssue({code: "custom", path, message});
  };
  if (value.mode === "baseline" && value.scenarios.length !== 1) {
    issue(["scenarios"], "baseline runs require exactly one scenario");
  }
  if (value.mode === "change" && value.scenarios.length < 2) {
    issue(["scenarios"], "change runs require at least two scenarios");
  }
  for (const [path, values] of [
    [["selectedDomains"], value.selectedDomains],
    [["scenarios"], value.scenarios.map((scenario) => scenario.id)],
    [["personaIds"], value.personaIds],
    [["evidence"], value.evidenceRefs.map((evidence) => evidence.ref)],
  ] as const) {
    const repeated = duplicate([...values]);
    if (repeated) issue([...path], `duplicate id: ${repeated}`);
  }

  const scenarioIds = new Set(value.scenarios.map((scenario) => scenario.id));
  const personaIds = new Set(value.personaIds);
  const evidenceIds = new Set(value.evidenceRefs.map((evidence) => evidence.ref));
  value.rounds.forEach((round, index) => {
    if (round.sequence !== index + 1) {
      issue(["rounds", index, "sequence"], "round sequences must be consecutive from 1");
    }
    if (round.scenarioId && !scenarioIds.has(round.scenarioId)) {
      issue(["rounds", index, "scenarioId"], "unknown scenario reference");
    }
    if (round.personaId && !personaIds.has(round.personaId)) {
      issue(["rounds", index, "personaId"], "unknown persona reference");
    }
    if (round.phase === "persona" && !round.personaId) {
      issue(["rounds", index, "personaId"], "persona rounds require a persona reference");
    }
    if (round.phase === "domain" && !round.domain) {
      issue(["rounds", index, "domain"], "domain rounds require a domain");
    }
    if (round.domain && !value.selectedDomains.includes(round.domain)) {
      issue(["rounds", index, "domain"], "round domain is outside the selected domains");
    }
    const repeatedEvidence = duplicate(round.evidenceRefs);
    if (repeatedEvidence) {
      issue(["rounds", index, "evidenceRefs"], `duplicate evidence: ${repeatedEvidence}`);
    }
    for (const reference of round.evidenceRefs) {
      if (!evidenceIds.has(reference)) {
        issue(["rounds", index, "evidenceRefs"], `unknown evidence reference: ${reference}`);
      }
    }
  });

  for (const scenarioId of scenarioIds) {
    if (!value.rounds.some((round) => round.scenarioId === scenarioId)) {
      issue(["rounds"], `scenario has no recorded round: ${scenarioId}`);
    }
  }
  for (const personaId of personaIds) {
    if (!value.rounds.some((round) =>
      round.phase === "persona" && round.personaId === personaId)) {
      issue(["rounds"], `persona has no recorded persona round: ${personaId}`);
    }
  }
  for (const domain of value.selectedDomains) {
    if (!value.rounds.some((round) =>
      round.phase === "domain" && round.domain === domain)) {
      issue(["rounds"], `selected domain has no recorded round: ${domain}`);
    }
  }
  for (const requiredPhase of ["critic", "synthesis"] as const) {
    if (!value.rounds.some((round) => round.phase === requiredPhase)) {
      issue(["rounds"], `simulation run requires a ${requiredPhase} round`);
    }
  }
  const finalEvidence = value.evidenceRefs.find(
    (evidence) => evidence.ref === value.finalEvaluationRef,
  );
  if (!finalEvidence || finalEvidence.kind !== "evaluation") {
    issue(["finalEvaluationRef"], "final evaluation must reference evaluation evidence");
  }
}

export const SaveRunInputBaseSchema = z.object({
  target: z.string().min(1),
  topic: z.string().trim().min(1).max(120),
  mode: SimulationModeSchema,
  selectedDomains: z.array(SimulationDomainSchema).min(1).max(6),
  model: ModelInputSchema,
  scenarios: z.array(ScenarioSchema).min(1).max(8),
  personaIds: z.array(ReferenceIdSchema).min(1).max(12),
  evidence: z.array(EvidenceReferenceInputSchema).min(1).max(100),
  rounds: z.array(SimulationRoundSchema).min(1).max(100),
  warnings: z.array(z.string().max(2_000)).max(100),
  confidence: ConfidenceInputSchema,
  finalEvaluationRef: ReferenceIdSchema,
}).strict();

export const SaveRunInputSchema = SaveRunInputBaseSchema.superRefine((value, context) => {
  validateRelations({
    ...value,
    personaIds: value.personaIds,
    evidenceRefs: value.evidence,
  }, context);
});

const ResolvedPersonaSchema = z.object({
  id: ReferenceIdSchema,
  path: z.string().min(1),
  sha256: Sha256Schema,
}).strict();

const ResolvedEvidenceSchema = z.object({
  ref: ReferenceIdSchema,
  kind: z.enum(["intel", "evaluation", "capture", "ui-reference"]),
  targetId: CanonicalTargetIdSchema.optional(),
  id: z.string().min(1),
  path: z.string().min(1),
  sha256: Sha256Schema,
}).strict();

const RunRecordBaseSchema = z.object({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  targetId: CanonicalTargetIdSchema,
  topic: z.string().min(1).max(120),
  mode: SimulationModeSchema,
  selectedDomains: z.array(SimulationDomainSchema).min(1).max(6),
  recipe: z.object({
    id: z.literal(RUN_RECIPE_ID),
    path: z.literal("skills/run-sim.md"),
    sha256: Sha256Schema,
  }).strict(),
  model: ModelInputSchema.extend({reportedByClient: z.literal(true)}).strict(),
  scenarios: z.array(ScenarioSchema).min(1).max(8),
  personas: z.array(ResolvedPersonaSchema).min(1).max(12),
  evidence: z.array(ResolvedEvidenceSchema).min(1).max(100),
  rounds: z.array(SimulationRoundSchema).min(1).max(100),
  warnings: z.array(z.string().max(2_000)).max(100),
  confidence: ConfidenceInputSchema.extend({reportedByClient: z.literal(true)}).strict(),
  finalEvaluationRef: ReferenceIdSchema,
  savedAt: IsoDateTimeSchema,
}).strict();

export const RunRecordSchema = RunRecordBaseSchema.superRefine((value, context) => {
  validateRelations({
    ...value,
    personaIds: value.personas.map((persona) => persona.id),
    evidenceRefs: value.evidence,
  }, context);
});

export const RunArtifactMetadataSchema = z.object({
  path: z.string().min(1),
  targetId: CanonicalTargetIdSchema,
  id: RunIdSchema,
  runId: RunIdSchema,
  topic: z.string().min(1).max(120),
  mode: SimulationModeSchema,
  selectedDomains: z.array(SimulationDomainSchema).min(1).max(6),
  savedAt: IsoDateTimeSchema,
  roundCount: z.number().int().positive(),
  evidenceCount: z.number().int().positive(),
  sizeBytes: z.number().int().positive().max(MAX_RUN_BYTES),
  sha256: Sha256Schema,
}).strict();

export type SaveRunInput = z.infer<typeof SaveRunInputSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type RunArtifactMetadata = z.infer<typeof RunArtifactMetadataSchema>;

export interface RunArtifact {
  metadata: RunArtifactMetadata;
  record: RunRecord;
}

interface RunFileHandle {
  stat(): Promise<Stats>;
  readFile(): Promise<Buffer>;
  close(): Promise<void>;
}

export interface RunFileOps {
  mkdir(path: string, options: {recursive: true}): Promise<string | undefined>;
  writeFile(
    path: string,
    data: string,
    options: {encoding: "utf8"; flag: "wx"},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string, options: {withFileTypes: true}): Promise<Dirent[]>;
  open(path: string, flags: number): Promise<RunFileHandle>;
}

const nodeFileOps: RunFileOps = {
  mkdir: (path, options) => nodeMkdir(path, options),
  writeFile: (path, data, options) => nodeWriteFile(path, data, options),
  link: nodeLink,
  unlink: nodeUnlink,
  readdir: (path, options) => nodeReaddir(path, options),
  open: (path, flags) => nodeOpen(path, flags) as Promise<FileHandle>,
};

export interface RunStoreOptions {
  clock?: () => Date;
  idFactory?: () => string;
  fileOps?: Partial<RunFileOps>;
}

export interface RunStore {
  saveRun(input: SaveRunInput): Promise<RunArtifactMetadata>;
  listTargets(): Promise<string[]>;
  listRuns(target: string): Promise<RunArtifactMetadata[]>;
  readRun(target: string, id: string): Promise<RunArtifact>;
}

export class RunSchemaError extends Error {
  override name = "RunSchemaError";
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function hash(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function relativeAssetPath(resolver: PathResolver, absolutePath: string): string {
  return relative(resolver.assetRoot, absolutePath).split(sep).join("/");
}

function evaluationId(id: string): {date: string; topic: string} {
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(id);
  if (!match?.[1] || !match[2]) throw new Error("invalid evaluation artifact id");
  return {date: match[1], topic: match[2]};
}

export function createRunStore(
  resolver: PathResolver,
  options: RunStoreOptions = {},
): RunStore {
  const ops = {...nodeFileOps, ...options.fileOps};
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? randomUUID;
  const probeId = "00000000-0000-4000-8000-000000000000";

  async function readRegularBytes(
    absolutePath: string,
    maxBytes: number,
  ): Promise<{bytes: Buffer; stats: Stats}> {
    let handle: RunFileHandle;
    try {
      handle = await ops.open(
        absolutePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if (isNodeError(error, "ELOOP")) {
        throw new Error("symlink run evidence is not allowed", {cause: error});
      }
      throw error;
    }
    try {
      const stats = await handle.stat();
      if (stats.isSymbolicLink()) throw new Error("symlink run evidence is not allowed");
      if (!stats.isFile()) throw new Error("run evidence is not a regular file");
      if (stats.size < 1 || stats.size > maxBytes) {
        throw new Error("run evidence exceeds its allowed size");
      }
      const bytes = await handle.readFile();
      const finalStats = await handle.stat();
      if (
        bytes.length !== stats.size
        || finalStats.size !== stats.size
        || finalStats.dev !== stats.dev
        || finalStats.ino !== stats.ino
        || finalStats.mtimeMs !== stats.mtimeMs
        || finalStats.ctimeMs !== stats.ctimeMs
      ) {
        throw new Error("run evidence changed while reading");
      }
      return {bytes, stats};
    } finally {
      await handle.close();
    }
  }

  function verifyImageSignature(resolved: ResolvedImagePath, bytes: Buffer): void {
    const signature = resolved.relativePath.endsWith(".jpg")
      ? JPEG_SIGNATURE
      : PNG_SIGNATURE;
    if (!bytes.subarray(0, signature.length).equals(signature)) {
      throw new Error("run image evidence has an invalid signature");
    }
  }

  async function resolveCapture(id: string): Promise<{
    resolved: ResolvedImagePath;
    bytes: Buffer;
  }> {
    const found: Array<{resolved: ResolvedImagePath; bytes: Buffer}> = [];
    for (const extension of ["png", "jpg"] as const) {
      const resolved = resolver.resolveCaptureReadPath(id, extension);
      try {
        const {bytes} = await readRegularBytes(
          resolved.absolutePath,
          MAX_INLINE_IMAGE_BYTES,
        );
        verifyImageSignature(resolved, bytes);
        found.push({resolved, bytes});
      } catch (error) {
        if (!isNodeError(error, "ENOENT")) throw error;
      }
    }
    if (found.length > 1) throw new Error("ambiguous capture evidence id");
    if (found.length < 1) throw new Error("capture evidence does not exist");
    return found[0]!;
  }

  async function resolveEvidence(
    input: z.infer<typeof EvidenceReferenceInputSchema>,
  ): Promise<z.infer<typeof ResolvedEvidenceSchema>> {
    if (input.kind === "intel") {
      const resolved = resolver.resolveIntelArtifactPath(input.target, input.id);
      const {bytes} = await readRegularBytes(
        resolved.absolutePath,
        MAX_STORED_INTEL_BYTES,
      );
      const record = IntelRecordSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      if (
        record.targetId !== resolved.targetId
        || record.artifactId !== resolved.artifactId
      ) {
        throw new Error("intel evidence does not match its path");
      }
      return {
        ref: input.ref,
        kind: input.kind,
        targetId: resolved.targetId,
        id: resolved.artifactId,
        path: resolved.relativePath,
        sha256: hash(bytes),
      };
    }
    if (input.kind === "evaluation") {
      const parsed = evaluationId(input.id);
      const resolved = resolver.resolveEvaluationPath(input.target, parsed.date, parsed.topic);
      const {bytes} = await readRegularBytes(
        resolved.absolutePath,
        MAX_EVALUATION_BYTES,
      );
      return {
        ref: input.ref,
        kind: input.kind,
        targetId: resolved.targetId,
        id: `${parsed.date}-${resolved.topicId}`,
        path: resolved.relativePath,
        sha256: hash(bytes),
      };
    }
    if (input.kind === "capture") {
      const {resolved, bytes} = await resolveCapture(input.id);
      return {
        ref: input.ref,
        kind: input.kind,
        id: resolved.id,
        path: resolved.relativePath,
        sha256: hash(bytes),
      };
    }
    const resolved = resolver.resolveUiReferencePath(input.id);
    const {bytes} = await readRegularBytes(
      resolved.absolutePath,
      MAX_INLINE_IMAGE_BYTES,
    );
    verifyImageSignature(resolved, bytes);
    return {
      ref: input.ref,
      kind: input.kind,
      id: resolved.id,
      path: resolved.relativePath,
      sha256: hash(bytes),
    };
  }

  async function resolvePersonas(ids: string[]): Promise<Array<z.infer<
    typeof ResolvedPersonaSchema
  >>> {
    const personas: Array<z.infer<typeof ResolvedPersonaSchema>> = [];
    for (const id of ids) {
      const path = resolver.resolvePersonaPath(id);
      const {bytes} = await readRegularBytes(path, MAX_PERSONA_BYTES);
      const parsed = PersonaSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      if (parsed.id !== id) throw new Error("persona evidence does not match its path");
      personas.push({
        id: parsed.id,
        path: relative(resolver.root, path).split(sep).join("/"),
        sha256: hash(bytes),
      });
    }
    return personas;
  }

  async function recipeRecord(): Promise<RunRecord["recipe"]> {
    const path = resolver.resolveSkillPath(RUN_RECIPE_ID);
    const {bytes} = await readRegularBytes(path, MAX_RECIPE_BYTES);
    const relativePath = relativeAssetPath(resolver, path);
    if (relativePath !== "skills/run-sim.md") {
      throw new Error("run recipe is outside the configured asset root");
    }
    return {id: RUN_RECIPE_ID, path: relativePath, sha256: hash(bytes)};
  }

  async function ensureDestination(target: string, runId: string): Promise<ResolvedRunPath> {
    const initial = resolver.resolveRunPath(target, runId);
    await ops.mkdir(dirname(initial.absolutePath), {recursive: true});
    const verified = resolver.resolveRunPath(target, runId);
    if (verified.absolutePath !== initial.absolutePath) {
      throw new Error("run destination changed during creation");
    }
    return verified;
  }

  async function atomicWrite(
    resolved: ResolvedRunPath,
    serialized: string,
  ): Promise<void> {
    const temporary = `${resolved.absolutePath}.${randomUUID()}.tmp`;
    let failed = false;
    try {
      await ops.writeFile(temporary, serialized, {encoding: "utf8", flag: "wx"});
      try {
        await ops.link(temporary, resolved.absolutePath);
      } catch (error) {
        if (isNodeError(error, "EEXIST")) {
          throw new Error(`simulation run already exists: ${resolved.runId}`);
        }
        throw error;
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

  function metadata(
    record: RunRecord,
    resolved: ResolvedRunPath,
    bytes: Buffer,
  ): RunArtifactMetadata {
    return RunArtifactMetadataSchema.parse({
      path: resolved.relativePath,
      targetId: record.targetId,
      id: record.runId,
      runId: record.runId,
      topic: record.topic,
      mode: record.mode,
      selectedDomains: record.selectedDomains,
      savedAt: record.savedAt,
      roundCount: record.rounds.length,
      evidenceCount: record.evidence.length,
      sizeBytes: bytes.length,
      sha256: hash(bytes),
    });
  }

  async function parseStoredRun(
    target: string,
    id: string,
  ): Promise<RunArtifact> {
    const resolved = resolver.resolveRunPath(target, RunIdSchema.parse(id));
    try {
      const {bytes} = await readRegularBytes(resolved.absolutePath, MAX_RUN_BYTES);
      const record = RunRecordSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      if (record.targetId !== resolved.targetId || record.runId !== resolved.runId) {
        throw new Error("run record does not match its path");
      }
      return {record, metadata: metadata(record, resolved, bytes)};
    } catch (error) {
      if (isNodeError(error, "ENOENT")) throw error;
      throw new RunSchemaError(`invalid run schema at ${resolved.relativePath}`, {
        cause: error,
      });
    }
  }

  async function saveRun(input: SaveRunInput): Promise<RunArtifactMetadata> {
    const parsed = SaveRunInputSchema.parse(input);
    const runId = RunIdSchema.parse(idFactory());
    const current = clock();
    if (Number.isNaN(current.getTime())) throw new Error("run clock is invalid");
    const savedAt = IsoDateTimeSchema.parse(current.toISOString());
    const resolved = await ensureDestination(parsed.target, runId);
    const evidence = [];
    for (const reference of parsed.evidence) {
      evidence.push(await resolveEvidence(reference));
    }
    const record = RunRecordSchema.parse({
      schemaVersion: 1,
      runId: resolved.runId,
      targetId: resolved.targetId,
      topic: parsed.topic,
      mode: parsed.mode,
      selectedDomains: parsed.selectedDomains,
      recipe: await recipeRecord(),
      model: {...parsed.model, reportedByClient: true},
      scenarios: parsed.scenarios,
      personas: await resolvePersonas(parsed.personaIds),
      evidence,
      rounds: parsed.rounds,
      warnings: parsed.warnings,
      confidence: {...parsed.confidence, reportedByClient: true},
      finalEvaluationRef: parsed.finalEvaluationRef,
      savedAt,
    });
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    const bytes = Buffer.from(serialized, "utf8");
    if (bytes.length > MAX_RUN_BYTES) {
      throw new Error("simulation run exceeds 2 MiB");
    }
    await atomicWrite(resolved, serialized);
    return metadata(record, resolved, bytes);
  }

  function workspaceRoot(): string {
    return dirname(dirname(dirname(
      resolver.resolveRunPath("run-list-probe", probeId).absolutePath,
    )));
  }

  async function listRuns(target: string): Promise<RunArtifactMetadata[]> {
    const directory = dirname(resolver.resolveRunPath(target, probeId).absolutePath);
    let entries: Dirent[];
    try {
      entries = await ops.readdir(directory, {withFileTypes: true});
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return [];
      throw error;
    }
    const runs: RunArtifactMetadata[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || !entry.name.endsWith(".json")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink simulation runs are not allowed");
      if (!entry.isFile()) continue;
      const id = entry.name.slice(0, -5);
      if (!RunIdSchema.safeParse(id).success) continue;
      const resolved = resolver.resolveRunPath(target, id);
      if (basename(resolved.absolutePath) !== entry.name) continue;
      runs.push((await parseStoredRun(target, id)).metadata);
    }
    return runs.sort((left, right) =>
      right.savedAt.localeCompare(left.savedAt) || left.id.localeCompare(right.id));
  }

  async function listTargets(): Promise<string[]> {
    const entries = await ops.readdir(workspaceRoot(), {withFileTypes: true});
    const targets: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink run targets are not allowed");
      if (!entry.isDirectory()) continue;
      if (!CanonicalTargetIdSchema.safeParse(entry.name).success) continue;
      const probe = resolver.resolveRunPath(entry.name, probeId);
      if (probe.targetId === entry.name && (await listRuns(entry.name)).length > 0) {
        targets.push(entry.name);
      }
    }
    return targets.sort((left, right) => left.localeCompare(right));
  }

  return {
    saveRun,
    listTargets,
    listRuns,
    readRun: parseStoredRun,
  };
}
