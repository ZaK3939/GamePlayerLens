import {access, mkdir, mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";

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
const cliArgumentIndex = process.argv.indexOf("--cli");
const cliArgument = cliArgumentIndex >= 0 ? process.argv[cliArgumentIndex + 1] : undefined;
assert(cliArgumentIndex < 0 || cliArgument !== undefined, "--cli requires a path");
const cliPath = cliArgument
  ? resolve(cliArgument)
  : join(repositoryRoot, "dist", "cli.js");
const live = process.argv.includes("--live");
const manifest = JSON.parse(
  await readFile(join(repositoryRoot, "package.json"), "utf8"),
) as {
  name?: string;
  bin?: Record<string, string>;
  files?: string[];
};

assert(manifest.name === "game-player-lens", "unexpected package name");
assert(
  manifest.bin?.["game-player-lens"] === "dist/cli.js",
  "game-player-lens bin is missing",
);
for (const runtimePath of [
  cliPath,
  join(repositoryRoot, "knowledge", "templates", "adoption-eval.md"),
  join(repositoryRoot, "knowledge", "rubrics", "harsh-critic.md"),
  join(repositoryRoot, "skills", "run-sim.md"),
]) {
  await access(runtimePath);
}
if (!cliArgument) {
  assert(
    (await readFile(cliPath, "utf8")).startsWith("#!/usr/bin/env node\n"),
    "compiled CLI is missing its node shebang",
  );
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "game-player-lens-package-smoke-"));
const foreignCwd = join(temporaryRoot, "foreign-cwd");
const dataRoot = join(temporaryRoot, "data-home");
await mkdir(foreignCwd);

const transport = new StdioClientTransport({
  command: cliArgument ? cliPath : process.execPath,
  args: cliArgument ? [] : [cliPath],
  cwd: foreignCwd,
  env: {...stringEnvironment(), GAME_PLAYER_LENS_HOME: dataRoot},
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr = `${stderr}${String(chunk)}`.slice(-4_096);
});

const client = new Client({name: "game-player-lens-package-smoke", version: "1.0.0"});
let connected = false;
let liveExactSave = false;
try {
  await client.connect(transport);
  connected = true;
  const tools = (await client.listTools()).tools;
  const prompts = (await client.listPrompts()).prompts;
  assert(tools.length === 11, "packaged CLI did not expose eleven tools");
  assert(prompts.length === 2, "packaged CLI did not expose two prompts");

  const knowledge = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "templates", id: "adoption-eval.md"},
  });
  assert(knowledge.isError !== true, "packaged CLI could not read canonical knowledge");
  assert(
    JSON.stringify(knowledge.structuredContent).includes("Overall Assessment"),
    "packaged CLI returned the wrong canonical template",
  );

  if (live) {
    const search = await client.callTool({
      name: "steam_search",
      arguments: {query: "Hades"},
    });
    assert(search.isError !== true, "packaged CLI steam_search returned a tool error");
    const searchEnvelope = search.structuredContent as {
      meta?: {resultHandle?: unknown};
    } | undefined;
    const resultHandle = searchEnvelope?.meta?.resultHandle;
    assert(typeof resultHandle === "string", "steam_search result handle is missing");

    const saved = await client.callTool({
      name: "save_artifact",
      arguments: {
        kind: "intel",
        target: "Hades",
        id: "Live Search Exact",
        resultHandle,
      },
    });
    assert(saved.isError !== true, "result-handle artifact save returned a tool error");
    const read = await client.callTool({
      name: "get_artifact",
      arguments: {kind: "intel", target: "Hades", id: "Live Search Exact"},
    });
    const record = read.structuredContent?.data as {
      sourceTool?: unknown;
      observedAt?: unknown;
      payload?: unknown;
    } | undefined;
    assert(record?.sourceTool === "steam_search", "sourceTool was not inferred from handle");
    assert(
      record.observedAt === (search.structuredContent?.meta as {observedAt?: unknown})?.observedAt,
      "observedAt was not inferred from handle",
    );
    assert(
      JSON.stringify(record.payload) === JSON.stringify(search.structuredContent),
      "saved payload is not the exact normalized tool envelope",
    );
    liveExactSave = true;
  }

  for (const relativePath of [
    "knowledge/personas",
    "knowledge/intel/captures",
    "knowledge/ui-references",
    "workspaces",
  ]) {
    await access(join(dataRoot, relativePath));
  }

  await client.close();
  connected = false;
  console.log(JSON.stringify({
    ok: true,
    package: manifest.name,
    tools: tools.length,
    prompts: prompts.length,
    isolatedDataHome: true,
    liveExactSave,
  }));
} catch (error) {
  if (stderr.trim()) console.error(`server stderr: ${stderr.trim().slice(-1_000)}`);
  throw error;
} finally {
  if (connected) await client.close();
  await rm(temporaryRoot, {recursive: true, force: true});
}
