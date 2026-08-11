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
  join(repositoryRoot, "knowledge", "rubrics", "evidence-coverage.md"),
  join(repositoryRoot, "knowledge", "rubrics", "playtest.md"),
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
let packageRunRoundTrip = false;
let playtestPromptRoundTrip = false;
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
  const uiGapRubric = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "rubrics", id: "ui-quality-gap.md"},
  });
  assert(uiGapRubric.isError !== true, "packaged CLI could not read the UI gap rubric");
  assert(
    JSON.stringify(uiGapRubric.structuredContent).includes("Game UI Database"),
    "packaged CLI returned the wrong UI gap rubric",
  );
  const coverageRubric = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "rubrics", id: "evidence-coverage.md"},
  });
  assert(coverageRubric.isError !== true, "packaged CLI could not read coverage rubric");
  assert(
    JSON.stringify(coverageRubric.structuredContent).includes("Direct observation rate"),
    "packaged CLI returned the wrong coverage rubric",
  );
  const playtestRubric = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "rubrics", id: "playtest.md"},
  });
  assert(playtestRubric.isError !== true, "packaged CLI could not read playtest rubric");
  assert(
    JSON.stringify(playtestRubric.structuredContent).includes("Action → response"),
    "packaged CLI returned the wrong playtest rubric",
  );

  const playtestPrompt = await client.getPrompt({
    name: "run-sim",
    arguments: {
      target: "Package Smoke Game",
      topic: "Playtest protocol wiring",
      mode: "baseline",
      domains: "gameplay",
      playtestUrl: "http://127.0.0.1:4173/play#package-smoke",
      playtestTask: "Reach the first checkpoint",
      playtestBuild: "package-smoke-fixture-1",
      playtestControls: "keyboard and mouse",
      playtestDurationMinutes: "15",
    },
  });
  const playtestContent = playtestPrompt.messages[0]?.content;
  assert(playtestContent?.type === "text", "packaged run-sim did not return text");
  assert(
    playtestContent.text.includes('"playtestUrl": "http://127.0.0.1:4173/play#package-smoke"')
      && playtestContent.text.includes('"playtestTask": "Reach the first checkpoint"')
      && playtestContent.text.includes('"playtestBuild": "package-smoke-fixture-1"')
      && playtestContent.text.includes('"playtestControls": "keyboard and mouse"')
      && playtestContent.text.includes('"playtestDurationMinutes": "15"')
      && playtestContent.text.includes('"selectedDomains": [\n    "gameplay"\n  ]'),
    "packaged run-sim did not round-trip the playtest protocol",
  );
  playtestPromptRoundTrip = true;

  const persona = await client.callTool({
    name: "save_persona",
    arguments: {
      persona: {
        id: "package-smoke-player",
        source_appids: [1145360],
        archetype: "Package smoke player",
        playtime_profile: "Short-session roguelike player",
        priorities: ["clear storefront promise"],
        voice: [1, 2, 3].map((index) => ({
          text: `package smoke voice ${index}`,
          source_appid: 1145360,
          recommendation_id: `package-smoke-${index}`,
          language: "english",
          voted_up: index !== 3,
        })),
        dealbreakers: ["unclear value proposition"],
        price_sensitivity: "medium",
      },
    },
  });
  assert(persona.isError !== true, "packaged CLI could not save a run persona");
  const intel = await client.callTool({
    name: "save_artifact",
    arguments: {
      kind: "intel",
      target: "Package Smoke Game",
      id: "Playtest Protocol Fixture",
      sourceTool: "manual",
      observedAt: "2026-08-11T00:00:00.000Z",
      payload: {
        synthetic: true,
        purpose: "Package wiring only; no game was operated",
        buildId: "package-smoke-fixture-1",
        task: "Reach the first checkpoint",
        verdict: "blocked",
        stopReason: "No playable build is started by this smoke test",
      },
    },
  });
  assert(intel.isError !== true, "packaged CLI could not save run intel");
  const evaluation = await client.callTool({
    name: "save_artifact",
    arguments: {
      kind: "evaluation",
      target: "Package Smoke Game",
      topic: "Package Run",
      date: "2026-08-11",
      content: "# Package run evaluation\n\nSynthetic protocol fixture only. No game was operated.",
    },
  });
  assert(evaluation.isError !== true, "packaged CLI could not save run evaluation");
  const run = await client.callTool({
    name: "save_artifact",
    arguments: {
      kind: "run",
      target: "Package Smoke Game",
      topic: "Package run",
      mode: "baseline",
      selectedDomains: ["gameplay"],
      model: {provider: "smoke", name: "package-client"},
      scenarios: [{
        id: "current",
        label: "Current",
        specification: "Package smoke fixture",
      }],
      personaIds: ["package-smoke-player"],
      evidence: [
        {
          ref: "playtest-protocol",
          kind: "intel",
          target: "Package Smoke Game",
          id: "Playtest Protocol Fixture",
        },
        {
          ref: "evaluation",
          kind: "evaluation",
          target: "Package Smoke Game",
          id: "2026-08-11-package-run",
        },
      ],
      rounds: [
        {
          sequence: 1,
          phase: "persona",
          actor: "package-smoke-player",
          personaId: "package-smoke-player",
          scenarioId: "current",
          output: "The fixture proves protocol transport only and contains no observed play.",
          evidenceRefs: ["playtest-protocol"],
        },
        {
          sequence: 2,
          phase: "domain",
          actor: "gameplay-reviewer",
          domain: "gameplay",
          scenarioId: "current",
          output: "Gameplay remains unobserved because this synthetic session is blocked.",
          evidenceRefs: ["playtest-protocol"],
        },
        {
          sequence: 3,
          phase: "critic",
          actor: "harsh-critic",
          output: "Synthetic protocol evidence cannot support a player-behavior claim.",
          evidenceRefs: ["playtest-protocol"],
        },
        {
          sequence: 4,
          phase: "synthesis",
          actor: "lead-synthesizer",
          output: "The package persistence path is verified, not the game hypothesis.",
          evidenceRefs: ["playtest-protocol"],
        },
      ],
      warnings: ["Package smoke uses a synthetic fixture and did not operate a game"],
      confidence: {
        level: "low",
        basis: "Protocol and persistence smoke only",
        calibrationStatus: "not-calibrated",
      },
      finalEvaluationRef: "evaluation",
    },
  });
  assert(run.isError !== true, "packaged CLI could not seal a simulation run");
  const runId = (run.structuredContent?.data as {id?: unknown} | undefined)?.id;
  assert(typeof runId === "string", "packaged CLI run save did not return an id");
  const runRead = await client.callTool({
    name: "get_artifact",
    arguments: {kind: "run", target: "Package Smoke Game", id: runId},
  });
  const runRecord = (runRead.structuredContent?.data as {
    record?: {
      runId?: unknown;
      recipe?: {sha256?: unknown};
      coverage?: {scenarioDomain?: {ratio?: unknown}};
      seal?: {canonicalSha256?: unknown};
      model?: {reportedByClient?: unknown};
      confidence?: {reportedByClient?: unknown};
      rounds?: unknown[];
    };
    integrity?: {status?: unknown; issueCount?: unknown};
  } | undefined)?.record;
  const runIntegrity = (runRead.structuredContent?.data as {
    integrity?: {status?: unknown; issueCount?: unknown};
  } | undefined)?.integrity;
  assert(runRead.isError !== true, "packaged CLI could not read a simulation run");
  assert(runRecord?.runId === runId, "packaged CLI returned the wrong run");
  assert(
    typeof runRecord.recipe?.sha256 === "string"
      && runRecord.model?.reportedByClient === true
      && runRecord.confidence?.reportedByClient === true
      && runRecord.coverage?.scenarioDomain?.ratio === 1
      && typeof runRecord.seal?.canonicalSha256 === "string"
      && runRecord.rounds?.length === 4,
    "packaged CLI run record is incomplete",
  );
  assert(
    runIntegrity?.status === "verified" && runIntegrity.issueCount === 0,
    "packaged CLI run integrity check failed",
  );
  packageRunRoundTrip = true;

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
    playtestPromptRoundTrip,
    packageRunRoundTrip,
    liveExactSave,
  }));
} catch (error) {
  if (stderr.trim()) console.error(`server stderr: ${stderr.trim().slice(-1_000)}`);
  throw error;
} finally {
  if (connected) await client.close();
  await rm(temporaryRoot, {recursive: true, force: true});
}
