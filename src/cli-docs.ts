import {readFile} from "node:fs/promises";
import {join} from "node:path";

const DOCUMENTS = [
  {
    name: "developer-project",
    description: "Operate a local game build, preserve evidence, and choose the next developer action.",
    path: ["docs", "guides", "developer-project.md"],
  },
  {
    name: "existing-game",
    description: "Research an existing Steam game using bounded market and player-review evidence.",
    path: ["docs", "guides", "existing-game.md"],
  },
  {
    name: "evidence-and-integrity",
    description: "Understand evidence kinds, exact saves, hashes, immutable revisions, and claim limits.",
    path: ["docs", "reference", "evidence-and-integrity.md"],
  },
  {
    name: "experiments",
    description: "Plan and record bounded game-development experiments and their outcomes.",
    path: ["docs", "reference", "experiments.md"],
  },
  {
    name: "tools",
    description: "Inspect every MCP tool, workflow entry point, save mode, and required input.",
    path: ["docs", "reference", "tools.md"],
  },
] as const;

const HELP = "Run `game-player-lens docs show <name>` to read one document.";

export function listCliDocuments() {
  return {
    documents: DOCUMENTS.map(({name, description}) => ({name, description})),
    help: HELP,
  };
}

export async function readCliDocument(packageRoot: string, name: string): Promise<string> {
  const document = DOCUMENTS.find((candidate) => candidate.name === name);
  if (!document) {
    throw new Error(`unknown document '${name}'. Run \`game-player-lens docs list\` to list document names.`);
  }
  return readFile(join(packageRoot, ...document.path), "utf8");
}

export const CLI_AGENT_HELP = "If you are a coding agent, run `game-player-lens docs list` and `game-player-lens docs show <name>` before operating or troubleshooting GamePlayerLens.";
