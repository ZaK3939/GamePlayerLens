import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {randomUUID} from "node:crypto";
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from "node:path";

export type KnowledgeKind = "personas" | "templates" | "rubrics" | "intel";

const PERSONA_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const KNOWLEDGE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
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
  if (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (existsSync(parent) && !isWithin(allowedRoot, realpathSync(parent))) {
      throw new Error("resolved parent escapes allowed root");
    }
    return;
  }

  if (lstatSync(candidate).isSymbolicLink()) {
    throw new Error("symlink paths are not allowed");
  }
  if (!isWithin(allowedRoot, realpathSync(candidate))) {
    throw new Error("resolved path escapes allowed root");
  }
}

function safeCaptureSlug(name?: string): string {
  const slug = name
    ?.normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "capture";
}

export interface PathResolver {
  readonly root: string;
  resolveKnowledgePath(kind: KnowledgeKind, id: string): string;
  resolvePersonaPath(id: string): string;
  resolveCapturePath(name?: string): string;
}

export function createPathResolver(rootPath: string): PathResolver {
  const root = realpathSync(resolve(rootPath));

  function resolveIn(base: string, fileName: string): string {
    const resolvedBase = resolve(root, base);
    if (!existsSync(resolvedBase)) {
      throw new Error(`required repository directory is missing: ${base}`);
    }
    const realBase = realpathSync(resolvedBase);
    if (!isWithin(root, realBase)) {
      throw new Error("allowed directory escapes repository root");
    }
    const candidate = resolve(resolvedBase, fileName);
    if (!isWithin(resolvedBase, candidate)) {
      throw new Error("path escapes allowed root");
    }
    validateExistingPath(realBase, candidate);
    return candidate;
  }

  return {
    root,

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
      return resolveIn(join("knowledge", kind), id);
    },

    resolvePersonaPath(id) {
      if (!PERSONA_ID.test(id)) throw new Error("invalid persona id");
      return resolveIn(join("knowledge", "personas"), `${id}.json`);
    },

    resolveCapturePath(name) {
      const fileName = `${safeCaptureSlug(name)}-${randomUUID()}.png`;
      return resolveIn(join("knowledge", "intel", "captures"), fileName);
    },
  };
}

function findRepoRoot(cwd: string): string {
  const packagePath = join(cwd, "package.json");
  if (!existsSync(packagePath)) {
    throw new Error("steam-user-sim must be started from the repository root");
  }
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {name?: string};
  if (packageJson.name !== "steam-user-sim") {
    throw new Error("current directory is not the steam-user-sim repository root");
  }
  return cwd;
}

let defaultResolver: PathResolver | undefined;

function getDefaultResolver(): PathResolver {
  defaultResolver ??= createPathResolver(findRepoRoot(process.cwd()));
  return defaultResolver;
}

export function resolveKnowledgePath(kind: KnowledgeKind, id: string): string {
  return getDefaultResolver().resolveKnowledgePath(kind, id);
}

export function resolvePersonaPath(id: string): string {
  return getDefaultResolver().resolvePersonaPath(id);
}

export function resolveCapturePath(name?: string): string {
  return getDefaultResolver().resolveCapturePath(name);
}
