import {randomUUID} from "node:crypto";
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
import {basename, dirname} from "node:path";
import {writeTextFileAtomically} from "./atomic-write.js";
import {
  type FileAccessCoordinator,
  withFileAccess as coordinateFileAccess,
} from "./file-access.js";
import {canonicalSha256, sha256} from "./integrity.js";
import {
  buildCoverage,
  buildSimulationReadiness,
} from "./run-analysis.js";
import {
  createRunEvidenceResolver,
  type ResolvedEvidenceResult,
} from "./run-evidence.js";
import {createRunIntegrityAuditor} from "./run-integrity.js";
import {createRunOutcomeChainVerifier} from "./run-outcome-chain.js";
import {
  CanonicalTargetIdSchema,
  IsoDateTimeSchema,
  MAX_RUN_BYTES,
  RunArtifactMetadataSchema,
  RunIdSchema,
  RunRecordCoreSchema,
  RunRecordSchema,
  SaveRunInputSchema,
  type RunArtifactMetadata,
  type RunIntegrityReport,
  type RunRecord,
  type SaveRunInput,
} from "./run-schemas.js";
import type {
  PathResolver,
  ResolvedRunPath,
} from "./paths.js";

export interface RunArtifact {
  metadata: RunArtifactMetadata;
  record: RunRecord;
  integrity: RunIntegrityReport;
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
  withFileAccess?: FileAccessCoordinator;
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
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === code) return true;
    current = current.cause;
  }
  return false;
}

export function createRunStore(
  resolver: PathResolver,
  options: RunStoreOptions = {},
): RunStore {
  const ops = {...nodeFileOps, ...options.fileOps};
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? randomUUID;
  const withFileAccess = options.withFileAccess ?? coordinateFileAccess;
  const probeId = "00000000-0000-4000-8000-000000000000";

  async function readRegularBytes(
    absolutePath: string,
    maxBytes: number,
  ): Promise<{bytes: Buffer; stats: Stats}> {
    return withFileAccess(absolutePath, async () => {
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
        if (isNodeError(error, "ENOENT")) {
          throw new Error("run evidence does not exist", {cause: error});
        }
        throw new Error("run evidence could not be opened", {cause: error});
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
    });
  }

  const evidenceResolver = createRunEvidenceResolver(resolver, readRegularBytes);
  const {
    resolveEvidence,
    resolvePersonas,
    resolveRecipe,
  } = evidenceResolver;
  const auditRun = createRunIntegrityAuditor(clock, evidenceResolver);

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
    await withFileAccess(resolved.absolutePath, () => writeTextFileAtomically(
      resolved.absolutePath,
      serialized,
      {
        fileOps: ops,
        alreadyExistsMessage: `simulation run already exists: ${resolved.runId}`,
      },
    ));
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
      subjectKind: record.subjectKind,
      market: record.market,
      language: record.language,
      mode: record.mode,
      selectedDomains: record.selectedDomains,
      savedAt: record.savedAt,
      roundCount: record.rounds.length,
      evidenceCount: record.evidence.length,
      simulationReadinessStatus: record.simulationReadiness.status,
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
    });
  }

  async function parseStoredRun(
    target: string,
    id: string,
  ): Promise<{metadata: RunArtifactMetadata; record: RunRecord}> {
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

  const verifyOutcomeChain = createRunOutcomeChainVerifier({
    resolveEvidence,
    readStoredRun: parseStoredRun,
    auditRun,
  });

  async function saveRun(input: SaveRunInput): Promise<RunArtifactMetadata> {
    const parsed = SaveRunInputSchema.parse(input);
    const runId = RunIdSchema.parse(idFactory());
    const current = clock();
    if (Number.isNaN(current.getTime())) throw new Error("run clock is invalid");
    const savedAt = IsoDateTimeSchema.parse(current.toISOString());
    const resolved = await ensureDestination(parsed.target, runId);
    const resolvedEvidence: ResolvedEvidenceResult[] = [];
    for (const reference of parsed.evidence) {
      resolvedEvidence.push(await resolveEvidence(reference));
    }
    const evidence = resolvedEvidence.map(({record}) => record);
    const finalEvaluationResult = resolvedEvidence.find(
      (item) => item.record.ref === parsed.finalEvaluationRef
        && item.record.kind === "evaluation",
    );
    const finalEvaluation = finalEvaluationResult?.record;
    if (
      (parsed.subjectKind === "developer-concept" || parsed.subjectKind === "developer-project")
      && finalEvaluation?.indieStrategyMode !== "detailed"
    ) {
      throw new Error(
        "developer runs require a detailed Indie Survival Strategy in the final evaluation",
      );
    }
    if (
      !finalEvaluationResult?.evaluationDomains
      || finalEvaluationResult.evaluationDomains.length !== parsed.selectedDomains.length
      || parsed.selectedDomains.some(
        (domain) => !finalEvaluationResult.evaluationDomains!.includes(domain),
      )
    ) {
      throw new Error(
        "run selectedDomains must exactly match the final evaluation Selected Domains",
      );
    }
    const core = RunRecordCoreSchema.parse({
      schemaVersion: 6,
      runId: resolved.runId,
      targetId: resolved.targetId,
      topic: parsed.topic,
      subjectKind: parsed.subjectKind,
      market: parsed.market,
      language: parsed.language,
      ...(parsed.projectBrief ? {projectBrief: parsed.projectBrief} : {}),
      mode: parsed.mode,
      selectedDomains: parsed.selectedDomains,
      recipe: await resolveRecipe(parsed.subjectKind, parsed.selectedDomains),
      model: {...parsed.model, reportedByClient: true},
      scenarios: parsed.scenarios,
      personas: await resolvePersonas(parsed.personaIds),
      evidence,
      rounds: parsed.rounds,
      warnings: parsed.warnings,
      confidence: {...parsed.confidence, reportedByClient: true},
      simulationReadiness: await buildSimulationReadiness(
        parsed,
        resolved.targetId,
        savedAt,
        resolvedEvidence,
        (outcome, currentSpec) => verifyOutcomeChain(
          outcome,
          currentSpec,
          resolvedEvidence,
          parsed,
          savedAt,
        ),
      ),
      finalEvaluationRef: parsed.finalEvaluationRef,
      savedAt,
      coverage: buildCoverage(parsed, evidence),
    });
    const record = RunRecordSchema.parse({
      ...core,
      seal: {
        algorithm: "sha256",
        canonicalSha256: canonicalSha256(core),
      },
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

  async function readRun(target: string, id: string): Promise<RunArtifact> {
    const stored = await parseStoredRun(target, id);
    return {...stored, integrity: await auditRun(stored.record)};
  }

  return {
    saveRun,
    listTargets,
    listRuns,
    readRun,
  };
}
