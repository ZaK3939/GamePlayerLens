import {
  link as nodeLink,
  readFile as nodeReadFile,
  readdir as nodeReaddir,
  rename as nodeRename,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import {dirname} from "node:path";
import {writeTextFileAtomically} from "./atomic-write.js";
import {PersonaSchema, type Persona} from "./persona-schemas.js";
import {resolvePersonaPath, type PathResolver} from "./paths.js";

export interface PersonaFileOps {
  writeFile(path: string, data: string, options: {encoding: "utf8"; flag: "wx"}): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readdir(path: string): Promise<string[]>;
}

const nodeFileOps: PersonaFileOps = {
  writeFile: (path, data, options) => nodeWriteFile(path, data, options),
  link: nodeLink,
  rename: nodeRename,
  unlink: nodeUnlink,
  readFile: nodeReadFile,
  readdir: (path) => nodeReaddir(path),
};

export interface PersonaStore {
  savePersona(persona: unknown, opts?: {overwrite?: boolean}): Promise<Persona>;
  loadPersona(id: string): Promise<Persona>;
  listPersonas(): Promise<Persona[]>;
}

export function createPersonaStore(
  resolver: Pick<PathResolver, "resolvePersonaPath">,
  fileOps: Partial<PersonaFileOps> = {},
): PersonaStore {
  const ops = {...nodeFileOps, ...fileOps};

  async function savePersona(
    input: unknown,
    opts: {overwrite?: boolean} = {},
  ): Promise<Persona> {
    const persona = PersonaSchema.parse(input);
    const destination = resolver.resolvePersonaPath(persona.id);
    await writeTextFileAtomically(
      destination,
      `${JSON.stringify(persona, null, 2)}\n`,
      {
        fileOps: ops,
        alreadyExistsMessage: `persona already exists: ${persona.id}`,
        overwrite: opts.overwrite,
      },
    );
    return persona;
  }

  async function loadPersona(id: string): Promise<Persona> {
    const path = resolver.resolvePersonaPath(id);
    const raw = await ops.readFile(path, "utf8");
    return PersonaSchema.parse(JSON.parse(raw) as unknown);
  }

  async function listPersonas(): Promise<Persona[]> {
    const probe = resolver.resolvePersonaPath("list-probe");
    const names = (await ops.readdir(dirname(probe)))
      .filter((name) => name.endsWith(".json") && !name.startsWith("."))
      .sort();
    return Promise.all(names.map((name) => loadPersona(name.slice(0, -5))));
  }

  return {savePersona, loadPersona, listPersonas};
}

function defaultResolver(): Pick<PathResolver, "resolvePersonaPath"> {
  return {resolvePersonaPath};
}

let repositoryStore: PersonaStore | undefined;

function getRepositoryStore(): PersonaStore {
  repositoryStore ??= createPersonaStore(defaultResolver());
  return repositoryStore;
}

export function savePersona(
  persona: unknown,
  opts?: {overwrite?: boolean},
): Promise<Persona> {
  return getRepositoryStore().savePersona(persona, opts);
}

export function loadPersona(id: string): Promise<Persona> {
  return getRepositoryStore().loadPersona(id);
}

export function listPersonas(): Promise<Persona[]> {
  return getRepositoryStore().listPersonas();
}

