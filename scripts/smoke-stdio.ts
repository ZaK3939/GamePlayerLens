import {access, readFile, readdir} from "node:fs/promises";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";

const EXPECTED_TOOLS = [
  "derive_personas",
  "get_artifact",
  "get_knowledge",
  "save_artifact",
  "save_persona",
  "steam_discover",
  "steam_fetch",
  "steam_reviews",
  "steam_search",
  "steam_timeline",
  "ui_capture",
];
const EXPECTED_PROMPTS = ["run-sim", "ui-blind-compare"];
const EXPECTED_RUN_SIM_ARGUMENTS = [
  "target",
  "topic",
  "mode",
  "domains",
  "specification",
  "uiUrl",
  "currentState",
  "proposal",
  "competitors",
  "market",
  "language",
  "qualityTier",
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stringEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"),
  );
}

async function repositoryArtifactEntries(root: string): Promise<string[]> {
  const artifactRoots = [
    "knowledge/intel",
    "knowledge/personas",
    "knowledge/ui-references",
    "workspaces",
  ];
  const entries: string[] = [];

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const absolutePath = resolve(directory, entry.name);
      const repositoryPath = relative(root, absolutePath);
      entries.push(`${entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file"}:${repositoryPath}`);
      if (entry.isDirectory()) await walk(absolutePath);
    }
  }

  for (const artifactRoot of artifactRoots) {
    await walk(resolve(root, artifactRoot));
  }
  return entries.sort();
}

function structuredData(result: {structuredContent?: unknown}): unknown {
  const envelope = result.structuredContent as {data?: unknown} | undefined;
  return envelope?.data;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
) as {name?: string};
assert(packageJson.name === "game-player-lens", "smoke must run against the game-player-lens repository");
await access(resolve(repositoryRoot, "dist", "index.js"));
const artifactsBefore = await repositoryArtifactEntries(repositoryRoot);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  cwd: repositoryRoot,
  env: stringEnvironment(),
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr = `${stderr}${String(chunk)}`.slice(-4_096);
});

const client = new Client({name: "game-player-lens-stdio-smoke", version: "1.0.0"});
const protocolErrors: string[] = [];
client.onerror = (error) => protocolErrors.push(error.message);
let summary: Record<string, unknown> | undefined;

try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
  const listedPrompts = (await client.listPrompts()).prompts;
  const prompts = listedPrompts.map((prompt) => prompt.name).sort();
  assert(JSON.stringify(tools) === JSON.stringify(EXPECTED_TOOLS), "unexpected MCP tool list");
  assert(JSON.stringify(prompts) === JSON.stringify(EXPECTED_PROMPTS), "unexpected MCP prompt list");

  const runSim = listedPrompts.find((prompt) => prompt.name === "run-sim");
  assert(runSim !== undefined, "run-sim prompt is missing");
  assert(
    JSON.stringify(runSim.arguments?.map((argument) => argument.name))
      === JSON.stringify(EXPECTED_RUN_SIM_ARGUMENTS),
    "unexpected run-sim prompt argument schema",
  );
  assert(
    JSON.stringify(
      runSim.arguments
        ?.filter((argument) => argument.required)
        .map((argument) => argument.name),
    ) === JSON.stringify(["target", "topic"]),
    "run-sim must require exactly target and topic",
  );

  const expandedPrompt = await client.getPrompt({
    name: "run-sim",
    arguments: {
      target: "Hades II",
      topic: "Japan launch price",
      mode: "baseline",
      domains: "competition,price",
      specification: "Evaluate the current launch price without a proposed change.",
      competitors: "Hades, Dead Cells",
      market: "Japan",
      language: "Japanese",
      qualityTier: "premium indie",
    },
  });
  assert(expandedPrompt.messages.length === 1, "run-sim must return one prompt message");
  const promptContent = expandedPrompt.messages[0]?.content;
  assert(promptContent?.type === "text", "run-sim must return text content");
  assert(
    promptContent.text.includes("--- END REPOSITORY RECIPE ---")
      && promptContent.text.includes("--- BEGIN INPUT DATA (JSON) ---"),
    "run-sim did not separate its recipe from argument data",
  );
  assert(
    promptContent.text.includes('"target": "Hades II"')
      && promptContent.text.includes('"mode": "baseline"')
      && promptContent.text.includes('"selectedDomains": [\n    "price",\n    "competition"\n  ]'),
    "run-sim did not normalize the supplied arguments",
  );

  const knowledge = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "templates", id: "adoption-eval.md"},
  });
  assert(knowledge.isError !== true, "get_knowledge returned a tool error");
  assert(
    JSON.stringify(knowledge.structuredContent).includes("Overall Assessment"),
    "get_knowledge did not return the canonical adoption template",
  );

  const artifactTargets = await client.callTool({
    name: "get_artifact",
    arguments: {kind: "evaluation"},
  });
  assert(artifactTargets.isError !== true, "get_artifact listing returned a tool error");
  assert(
    Array.isArray(structuredData(artifactTargets)),
    "get_artifact did not return a read-only evaluation target list",
  );

  let liveSearch = false;
  let liveDiscovery = false;
  if (process.argv.includes("--live")) {
    const search = await client.callTool({
      name: "steam_search",
      arguments: {query: "Hades"},
    });
    assert(search.isError !== true, "steam_search returned a tool error");
    assert(
      JSON.stringify(search.structuredContent).includes("1145360"),
      "steam_search did not find Hades appid 1145360",
    );
    liveSearch = true;

    const discovery = await client.callTool({
      name: "steam_discover",
      arguments: {kind: "tag", value: "Action Roguelike", limit: 5},
    });
    assert(discovery.isError !== true, "steam_discover returned a tool error");
    const discoveryData = structuredData(discovery) as {
      candidates?: Array<{appid?: unknown; name?: unknown}>;
    } | null;
    assert(
      discoveryData?.candidates?.some((candidate) =>
        Number.isSafeInteger(candidate.appid)
        && Number(candidate.appid) > 0
        && typeof candidate.name === "string"
        && candidate.name.trim().length > 0),
      "steam_discover did not return a valid Action Roguelike candidate",
    );
    liveDiscovery = true;
  }

  assert(protocolErrors.length === 0, `stdio protocol errors: ${protocolErrors.join("; ")}`);
  summary = {
    ok: true,
    tools: tools.length,
    prompts: prompts.length,
    liveSearch,
    liveDiscovery,
    protocolErrors: protocolErrors.length,
  };
} catch (error) {
  if (stderr.trim()) console.error(`server stderr: ${stderr.trim().slice(-1_000)}`);
  throw error;
} finally {
  await client.close();
  const artifactsAfter = await repositoryArtifactEntries(repositoryRoot);
  assert(
    JSON.stringify(artifactsAfter) === JSON.stringify(artifactsBefore),
    "stdio smoke created or deleted a repository artifact",
  );
}

assert(summary !== undefined, "stdio smoke did not complete");
console.log(JSON.stringify(summary));
