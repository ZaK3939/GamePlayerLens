import {readFile, readdir} from "node:fs/promises";
import {dirname} from "node:path";
import {
  resolveKnowledgePath,
  type KnowledgeKind,
  type PathResolver,
} from "./paths.js";
import {
  listPersonas,
  loadPersona,
  type PersonaStore,
} from "./persona-store.js";

export type KnowledgeResult =
  | {
      kind: KnowledgeKind;
      items: Array<{
        id: string;
        archetype?: string;
        source_appids?: number[];
      }>;
    }
  | {kind: "personas"; id: string; persona: Awaited<ReturnType<typeof loadPersona>>}
  | {kind: Exclude<KnowledgeKind, "personas">; id: string; content: string};

const PROBE_IDS: Record<KnowledgeKind, string> = {
  personas: "list-probe.json",
  templates: "list-probe.md",
  rubrics: "list-probe.md",
  intel: "list-probe.json",
};

const ALLOWED_EXTENSIONS: Record<KnowledgeKind, ReadonlySet<string>> = {
  personas: new Set([".json"]),
  templates: new Set([".md"]),
  rubrics: new Set([".md"]),
  intel: new Set([".json", ".md", ".txt"]),
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

export type KnowledgeReader = (
  kind: KnowledgeKind,
  id?: string,
) => Promise<KnowledgeResult>;

export function createKnowledgeReader(
  resolver: Pick<PathResolver, "resolveKnowledgePath">,
  personaStore: Pick<PersonaStore, "loadPersona" | "listPersonas">,
): KnowledgeReader {
  return async (kind, id) => {
    if (id === undefined) {
      if (kind === "personas") {
        const personas = await personaStore.listPersonas();
        return {
          kind,
          items: personas.map((persona) => ({
            id: persona.id,
            archetype: persona.archetype,
            source_appids: persona.source_appids,
          })),
        };
      }

      const probe = resolver.resolveKnowledgePath(kind, PROBE_IDS[kind]);
      const names = (await readdir(dirname(probe)))
        .filter((name) => !name.startsWith(".") && ALLOWED_EXTENSIONS[kind].has(extensionOf(name)))
        .sort();
      for (const name of names) resolver.resolveKnowledgePath(kind, name);
      return {kind, items: names.map((name) => ({id: name}))};
    }

    if (kind === "personas") {
      const persona = await personaStore.loadPersona(id);
      return {kind, id, persona};
    }
    const path = resolver.resolveKnowledgePath(kind, id);
    return {kind, id, content: await readFile(path, "utf8")};
  };
}

function repositoryResolver(): Pick<PathResolver, "resolveKnowledgePath"> {
  return {resolveKnowledgePath};
}

const repositoryPersonaStore: Pick<PersonaStore, "loadPersona" | "listPersonas"> = {
  loadPersona,
  listPersonas,
};

export const readKnowledge = createKnowledgeReader(
  repositoryResolver(),
  repositoryPersonaStore,
);
