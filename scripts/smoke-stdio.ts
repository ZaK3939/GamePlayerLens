import {access, readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";

const EXPECTED_TOOLS = [
  "derive_personas",
  "get_knowledge",
  "save_persona",
  "steam_fetch",
  "steam_reviews",
  "steam_search",
  "steam_timeline",
  "ui_capture",
];
const EXPECTED_PROMPTS = ["run-sim", "ui-blind-compare"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stringEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"),
  );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
) as {name?: string};
assert(packageJson.name === "steam-user-sim", "smoke must run against the steam-user-sim repository");
await access(resolve(repositoryRoot, "dist", "index.js"));

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

const client = new Client({name: "steam-user-sim-stdio-smoke", version: "1.0.0"});
const protocolErrors: string[] = [];
client.onerror = (error) => protocolErrors.push(error.message);

try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
  const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name).sort();
  assert(JSON.stringify(tools) === JSON.stringify(EXPECTED_TOOLS), "unexpected MCP tool list");
  assert(JSON.stringify(prompts) === JSON.stringify(EXPECTED_PROMPTS), "unexpected MCP prompt list");

  const knowledge = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "templates", id: "adoption-eval.md"},
  });
  assert(knowledge.isError !== true, "get_knowledge returned a tool error");
  assert(
    JSON.stringify(knowledge.structuredContent).includes("Overall Assessment"),
    "get_knowledge did not return the canonical adoption template",
  );

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
  }

  assert(protocolErrors.length === 0, `stdio protocol errors: ${protocolErrors.join("; ")}`);
  console.log(JSON.stringify({
    ok: true,
    tools: tools.length,
    prompts: prompts.length,
    liveSearch: process.argv.includes("--live"),
  }));
} catch (error) {
  if (stderr.trim()) console.error(`server stderr: ${stderr.trim().slice(-1_000)}`);
  throw error;
} finally {
  await client.close();
}
