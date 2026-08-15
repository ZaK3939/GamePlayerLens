import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {randomUUID} from "node:crypto";
import {basename, isAbsolute, join, relative, resolve, sep} from "node:path";

export type KnowledgeKind = "personas" | "templates" | "rubrics" | "intel";
export type CaptureImageExtension = "png" | "jpg";

const PERSONA_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const KNOWLEDGE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const SKILL_ID = /^(?:[a-z0-9][a-z0-9._-]{0,127}\.md|[a-z0-9][a-z0-9-]{0,63}\/SKILL\.md)$/i;
const EVALUATION_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSIONS: Record<KnowledgeKind, ReadonlySet<string>> = {
  personas: new Set([".json"]),
  templates: new Set([".md"]),
  rubrics: new Set([".md"]),
  intel: new Set([".json", ".md", ".txt"]),
};

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot).toLowerCase();
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
  );
}

function validateExistingPath(allowedRoot: string, candidate: string): void {
  if (!isWithin(allowedRoot, candidate)) {
    throw new Error("path escapes allowed root");
  }

  const pathFromRoot = relative(allowedRoot, candidate);
  let current = allowedRoot;
  for (const part of pathFromRoot.split(sep).filter(Boolean)) {
    current = join(current, part);
    if (!existsSync(current)) break;

    const stats = lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new Error("symlink paths are not allowed");
    }
    if (!isWithin(allowedRoot, realpathSync(current))) {
      throw new Error("resolved path escapes allowed root");
    }
    if (current !== candidate && !stats.isDirectory()) {
      throw new Error("artifact parent path is not a directory");
    }
  }
}

function safeSlug(displayName: string): string {
  if (
    typeof displayName !== "string"
    || displayName.length < 1
    || displayName.length > 80
    || isAbsolute(displayName)
    || displayName.includes("/")
    || displayName.includes("\\")
    || displayName.includes("\0")
  ) {
    throw new Error("invalid display name");
  }

  const trimmed = displayName.trim();
  if (/^\.+$/.test(trimmed)) {
    throw new Error("invalid dot-only display name");
  }

  const slug = trimmed
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{Nd}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 1 || slug.length > 64) {
    throw new Error("canonical id must contain 1 to 64 characters");
  }
  return slug;
}

function validateEvaluationDate(date: string): void {
  const parsed = EVALUATION_DATE.test(date)
    ? new Date(`${date}T00:00:00.000Z`)
    : null;
  if (
    !parsed
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date
    || date.startsWith("0000-")
  ) {
    throw new Error("invalid evaluation date");
  }
}

function safeCaptureSlug(name?: string): string {
  const slug = name
    ?.normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 27);
  return slug || "capture";
}

export interface PathResolver {
  readonly root: string;
  readonly assetRoot: string;
  resolveKnowledgePath(kind: KnowledgeKind, id: string): string;
  resolvePersonaPath(id: string): string;
  resolveCapturePath(name?: string, extension?: CaptureImageExtension): string;
  resolveSkillPath(id: string): string;
  resolveIntelArtifactPath(target: string, id: string): ResolvedIntelArtifactPath;
  resolveEvaluationPath(
    target: string,
    date: string,
    topic: string,
  ): ResolvedEvaluationPath;
  resolveRunPath(target: string, runId: string): ResolvedRunPath;
  resolveCaptureReadPath(
    id: string,
    extension?: CaptureImageExtension,
  ): ResolvedImagePath;
  resolveUiReferencePath(id: string): ResolvedImagePath;
}

export interface ResolvedPath {
  absolutePath: string;
  relativePath: string;
}

export interface ResolvedIntelArtifactPath extends ResolvedPath {
  targetId: string;
  artifactId: string;
}

export interface ResolvedEvaluationPath extends ResolvedPath {
  targetId: string;
  topicId: string;
}

export interface ResolvedRunPath extends ResolvedPath {
  targetId: string;
  runId: string;
}

export interface ResolvedImagePath extends ResolvedPath {
  id: string;
}

function createSplitPathResolver(
  assetRootPath: string,
  dataRootPath: string,
): PathResolver {
  const assetRoot = realpathSync(resolve(assetRootPath));
  const root = realpathSync(resolve(dataRootPath));

  function resolveIn(storageRoot: string, base: string, fileName: string): string {
    const resolvedBase = resolve(storageRoot, base);
    if (!existsSync(resolvedBase)) {
      throw new Error(`required repository directory is missing: ${base}`);
    }
    const baseStats = lstatSync(resolvedBase);
    if (baseStats.isSymbolicLink() || !baseStats.isDirectory()) {
      throw new Error("allowed directory is missing or invalid");
    }
    const realBase = realpathSync(resolvedBase);
    if (!isWithin(storageRoot, realBase)) {
      throw new Error("allowed directory escapes repository root");
    }
    const candidate = resolve(resolvedBase, fileName);
    if (!isWithin(resolvedBase, candidate)) {
      throw new Error("path escapes allowed root");
    }
    validateExistingPath(realBase, candidate);
    return candidate;
  }

  function resolvedPath(absolutePath: string): ResolvedPath {
    if (!isWithin(root, absolutePath)) {
      throw new Error("resolved path escapes repository root");
    }
    return {
      absolutePath,
      relativePath: relative(root, absolutePath).split(sep).join("/"),
    };
  }

  function captureExtension(value: CaptureImageExtension = "png"): CaptureImageExtension {
    if (value !== "png" && value !== "jpg") {
      throw new Error("invalid capture image extension");
    }
    return value;
  }

  return {
    root,
    assetRoot,

    resolveKnowledgePath(kind, id) {
      if (
        basename(id) !== id ||
        id === "." ||
        id === ".." ||
        id.startsWith(".") ||
        !KNOWLEDGE_ID.test(id)
      ) {
        throw new Error("invalid knowledge id");
      }
      if (!EXTENSIONS[kind].has(extensionOf(id))) {
        throw new Error(`invalid extension for knowledge kind: ${kind}`);
      }
      const storageRoot = kind === "templates" || kind === "rubrics"
        ? assetRoot
        : root;
      return resolveIn(storageRoot, join("knowledge", kind), id);
    },

    resolvePersonaPath(id) {
      if (!PERSONA_ID.test(id)) throw new Error("invalid persona id");
      return resolveIn(root, join("knowledge", "personas"), `${id}.json`);
    },

    resolveCapturePath(name, extension = "png") {
      const fileName = `${safeCaptureSlug(name)}-${randomUUID()}.${captureExtension(extension)}`;
      return resolveIn(root, join("knowledge", "intel", "captures"), fileName);
    },

    resolveSkillPath(id) {
      if (
        !SKILL_ID.test(id)
        || extensionOf(id) !== ".md"
      ) {
        throw new Error("invalid skill id");
      }
      return resolveIn(assetRoot, "skills", id);
    },

    resolveIntelArtifactPath(target, id) {
      const targetId = safeSlug(target);
      const artifactId = safeSlug(id);
      const absolutePath = resolveIn(
        root,
        join("knowledge", "intel"),
        join(targetId, `${artifactId}.json`),
      );
      return {targetId, artifactId, ...resolvedPath(absolutePath)};
    },

    resolveEvaluationPath(target, date, topic) {
      const targetId = safeSlug(target);
      const topicId = safeSlug(topic);
      validateEvaluationDate(date);
      const absolutePath = resolveIn(
        root,
        "workspaces",
        join(targetId, `${date}-${topicId}.md`),
      );
      return {targetId, topicId, ...resolvedPath(absolutePath)};
    },

    resolveRunPath(target, runId) {
      const targetId = safeSlug(target);
      if (!RUN_ID.test(runId)) throw new Error("invalid simulation run id");
      const canonicalRunId = runId.toLowerCase();
      const absolutePath = resolveIn(
        root,
        "workspaces",
        join(targetId, "runs", `${canonicalRunId}.json`),
      );
      return {targetId, runId: canonicalRunId, ...resolvedPath(absolutePath)};
    },

    resolveCaptureReadPath(id, extension = "png") {
      const canonicalId = safeSlug(id);
      const absolutePath = resolveIn(
        root,
        join("knowledge", "intel", "captures"),
        `${canonicalId}.${captureExtension(extension)}`,
      );
      return {id: canonicalId, ...resolvedPath(absolutePath)};
    },

    resolveUiReferencePath(id) {
      const canonicalId = safeSlug(id);
      const absolutePath = resolveIn(
        root,
        join("knowledge", "ui-references"),
        `${canonicalId}.png`,
      );
      return {id: canonicalId, ...resolvedPath(absolutePath)};
    },
  };
}

export function createPathResolver(rootPath: string): PathResolver {
  return createSplitPathResolver(rootPath, rootPath);
}

export function initializePackagedPaths(
  assetRootPath: string,
  dataRootPath: string,
): PathResolver {
  const dataRoot = resolve(dataRootPath);
  mkdirSync(dataRoot, {recursive: true});
  const realDataRoot = realpathSync(dataRoot);

  function ensureDataDirectory(relativePath: string): void {
    let current = realDataRoot;
    for (const part of relativePath.split("/")) {
      current = join(current, part);
      if (!existsSync(current)) {
        mkdirSync(current);
        continue;
      }
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) {
        throw new Error("data-home symlink directories are not allowed");
      }
      if (!stats.isDirectory()) {
        throw new Error("data-home path is not a directory");
      }
    }
  }

  for (const directory of [
    "knowledge/personas",
    "knowledge/intel/captures",
    "knowledge/ui-references",
    "workspaces",
  ]) {
    ensureDataDirectory(directory);
  }

  const resolver = createSplitPathResolver(assetRootPath, realDataRoot);
  resolver.resolveKnowledgePath("templates", "startup-probe.md");
  resolver.resolveKnowledgePath("rubrics", "startup-probe.md");
  resolver.resolveKnowledgePath("intel", "startup-probe.json");
  resolver.resolvePersonaPath("startup-probe");
  resolver.resolveSkillPath("startup-probe.md");
  resolver.resolveCaptureReadPath("startup-probe");
  resolver.resolveUiReferencePath("startup-probe");
  resolver.resolveEvaluationPath("startup-probe", "2000-01-01", "startup-probe");
  resolver.resolveRunPath("startup-probe", "00000000-0000-4000-8000-000000000000");
  return resolver;
}

function findRepoRoot(cwd: string): string {
  const root = realpathSync(resolve(cwd));
  const packagePath = join(root, "package.json");
  if (!existsSync(packagePath)) {
    throw new Error("game-player-lens must be started from the repository root");
  }
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {name?: string};
  if (packageJson.name !== "game-player-lens") {
    throw new Error("current directory is not the game-player-lens repository root");
  }
  for (const directory of ["knowledge", "skills", "workspaces"]) {
    const candidate = join(root, directory);
    const stats = existsSync(candidate) ? lstatSync(candidate) : null;
    if (
      !stats
      || stats.isSymbolicLink()
      || !stats.isDirectory()
    ) {
      throw new Error(`required repository directory is missing or invalid: ${directory}`);
    }
    if (!isWithin(root, realpathSync(candidate))) {
      throw new Error(`required repository directory escapes root: ${directory}`);
    }
  }
  return root;
}

let defaultResolver: PathResolver | undefined;

function getDefaultResolver(): PathResolver {
  defaultResolver ??= createPathResolver(findRepoRoot(process.cwd()));
  return defaultResolver;
}

export function initializeRepositoryPaths(cwd = process.cwd()): PathResolver {
  defaultResolver = createPathResolver(findRepoRoot(cwd));
  return defaultResolver;
}

export function resolveKnowledgePath(kind: KnowledgeKind, id: string): string {
  return getDefaultResolver().resolveKnowledgePath(kind, id);
}

export function resolvePersonaPath(id: string): string {
  return getDefaultResolver().resolvePersonaPath(id);
}

export function resolveCapturePath(
  name?: string,
  extension?: CaptureImageExtension,
): string {
  return getDefaultResolver().resolveCapturePath(name, extension);
}

export function resolveSkillPath(id: string): string {
  return getDefaultResolver().resolveSkillPath(id);
}

export function resolveIntelArtifactPath(
  target: string,
  id: string,
): ResolvedIntelArtifactPath {
  return getDefaultResolver().resolveIntelArtifactPath(target, id);
}

export function resolveEvaluationPath(
  target: string,
  date: string,
  topic: string,
): ResolvedEvaluationPath {
  return getDefaultResolver().resolveEvaluationPath(target, date, topic);
}

export function resolveRunPath(target: string, runId: string): ResolvedRunPath {
  return getDefaultResolver().resolveRunPath(target, runId);
}

export function resolveCaptureReadPath(
  id: string,
  extension?: CaptureImageExtension,
): ResolvedImagePath {
  return getDefaultResolver().resolveCaptureReadPath(id, extension);
}

export function resolveUiReferencePath(id: string): ResolvedImagePath {
  return getDefaultResolver().resolveUiReferencePath(id);
}
