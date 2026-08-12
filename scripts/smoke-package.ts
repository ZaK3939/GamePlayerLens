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
  join(repositoryRoot, "knowledge", "rubrics", "update-strategy.md"),
  join(repositoryRoot, "knowledge", "rubrics", "experiment.md"),
  join(repositoryRoot, "knowledge", "rubrics", "indie-survival-strategy.md"),
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
let liveUpdates = false;
let packageRunRoundTrip = false;
let playtestPromptRoundTrip = false;
let experimentLoopRoundTrip = false;
try {
  await client.connect(transport);
  connected = true;
  const tools = (await client.listTools()).tools;
  const prompts = (await client.listPrompts()).prompts;
  assert(tools.length === 12, "packaged CLI did not expose twelve tools");
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
  const updateRubric = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "rubrics", id: "update-strategy.md"},
  });
  assert(updateRubric.isError !== true, "packaged CLI could not read update strategy rubric");
  assert(
    JSON.stringify(updateRubric.structuredContent).includes("Persona Update Impact Matrix"),
    "packaged CLI returned the wrong update strategy rubric",
  );
  const experimentRubric = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "rubrics", id: "experiment.md"},
  });
  assert(experimentRubric.isError !== true, "packaged CLI could not read experiment rubric");
  assert(
    JSON.stringify(experimentRubric.structuredContent).includes("ExperimentOutcome"),
    "packaged CLI returned the wrong experiment rubric",
  );
  const indieSurvivalRubric = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "rubrics", id: "indie-survival-strategy.md"},
  });
  assert(
    indieSurvivalRubric.isError !== true,
    "packaged CLI could not read indie survival strategy rubric",
  );
  const indieSurvivalContent = JSON.stringify(indieSurvivalRubric.structuredContent);
  assert(
    indieSurvivalContent.includes("Promise-Delivery Trace")
      && indieSurvivalContent.includes("partner.steamgames.com/doc/marketing/upcoming_events/nextfest"),
    "packaged CLI returned the wrong indie survival strategy rubric",
  );

  const playtestPrompt = await client.getPrompt({
    name: "run-sim",
    arguments: {
      target: "Package Smoke Game",
      topic: "Playtest protocol wiring",
      mode: "baseline",
      domains: "gameplay",
      projectBrief: JSON.stringify({
        revisionId: "brief-v1",
        developmentStage: "prototype",
        targetPlayer: "players learning a new action loop",
        repeatedAction: "read, act, recover",
        immediateReward: "clear response to a successful action",
        oneSentencePromise: "Learn the loop and reach the checkpoint",
        runwayMonths: 6,
      }),
      conceptTest: JSON.stringify({
        testedAt: "2026-08-12T10:00:00+04:00",
        stimulusId: "package-pitch-v1",
        projectBriefRevision: "brief-v1",
        promiseShown: "Learn the loop and reach the checkpoint",
        stimulusDescription: "A short pitch card",
        exposureProtocol: "Show once, then ask unaided questions",
        recruitment: "External action-game players",
        targetPlayerDefinition: "Players learning a new action loop",
        questionsAsked: ["What would you do?", "What would feel rewarding?"],
        participants: [{
          participantId: "p-01",
          targetFit: "medium",
          understoodAction: "yes",
          understoodReward: "unclear",
          interest: "maybe",
          confusions: ["The checkpoint reward was unclear"],
        }],
      }),
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
      && playtestContent.text.includes('"projectBrief": {')
      && playtestContent.text.includes('"projectBriefDiagnostics": {')
      && playtestContent.text.includes('"status": "inventory-only"')
      && playtestContent.text.includes('"conceptTest": {')
      && playtestContent.text.includes('"conceptTestDiagnostics": {')
      && playtestContent.text.includes('"revisionStatus": "matched"')
      && playtestContent.text.includes('"promiseStatus": "matched"')
      && playtestContent.text.includes('"conceptTestEvidence": {')
      && playtestContent.text.includes('"exactSaveRequired": true')
      && playtestContent.text.includes('"status": "descriptive-only"')
      && playtestContent.text.includes('"participantCount": 1')
      && playtestContent.text.includes('"developmentStage": "prototype"')
      && playtestContent.text.includes('"runwayMonths": 6')
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
  const experimentSpecArguments = {
    kind: "intel",
    target: "Package Smoke Game",
    id: "Experiment Package Smoke 001 Spec",
    sourceTool: "manual",
    observedAt: "2026-08-11T00:00:00.000Z",
    payload: {
      schemaVersion: 1,
      artifactType: "experiment-spec",
      experimentId: "package-smoke-001",
      targetId: "package-smoke-game",
      hypothesis: "A playable fixture would allow the checkpoint task to complete",
      mode: "baseline",
      plannedScenarios: [{
        id: "current",
        label: "Current",
        specification: "Package smoke fixture",
      }],
      primaryMetricId: "task-completion",
      metrics: [{
        metricId: "task-completion",
        role: "primary",
        source: "ai-playtest",
        instrument: "package smoke playtest protocol v1",
        unit: "boolean/session",
        aggregation: "proportion",
        direction: "increase",
        cohort: "single package smoke client",
        window: "15 minute checkpoint task",
        samplePlan: {unit: "session", targetCount: 1, minimumCount: 1},
      }],
      successCriteria: [{
        criterionId: "checkpoint-completed",
        metricId: "task-completion",
        scenarioId: "current",
        comparator: ">=",
        value: 1,
      }],
      guardrails: [],
      predictions: [{
        metricId: "task-completion",
        scenarioId: "current",
        predictedValue: 1,
        confidence: "low",
        basis: "Synthetic persistence fixture only",
      }],
      stoppingRule: {
        outcomeDeadline: "2026-08-12",
        maximumSessions: 1,
        onGuardrailBreach: "stop-and-review",
        onRepeatedSourceBias: "stop-and-change-source",
      },
      orderBiasPlan: "N/A for one baseline scenario",
      parentOutcomeRef: null,
    },
  } as const;
  const experimentSpec = await client.callTool({
    name: "save_artifact",
    arguments: experimentSpecArguments,
  });
  assert(experimentSpec.isError !== true, "packaged CLI could not pre-register experiment spec");
  const duplicateExperimentSpec = await client.callTool({
    name: "save_artifact",
    arguments: experimentSpecArguments,
  });
  assert(
    duplicateExperimentSpec.isError === true,
    "packaged CLI allowed experiment spec replacement without overwrite",
  );
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
          ref: "experiment-spec",
          kind: "intel",
          target: "Package Smoke Game",
          id: "Experiment Package Smoke 001 Spec",
        },
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
          evidenceRefs: ["experiment-spec", "playtest-protocol"],
        },
        {
          sequence: 2,
          phase: "domain",
          actor: "gameplay-reviewer",
          domain: "gameplay",
          scenarioId: "current",
          output: "Gameplay remains unobserved because this synthetic session is blocked.",
          evidenceRefs: ["experiment-spec", "playtest-protocol"],
        },
        {
          sequence: 3,
          phase: "critic",
          actor: "harsh-critic",
          output: "Synthetic protocol evidence cannot support a player-behavior claim.",
          evidenceRefs: ["experiment-spec", "playtest-protocol"],
        },
        {
          sequence: 4,
          phase: "synthesis",
          actor: "lead-synthesizer",
          output: "The package persistence path is verified, not the game hypothesis.",
          evidenceRefs: ["experiment-spec", "playtest-protocol"],
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
  const runMetadata = run.structuredContent?.data as {
    id?: unknown;
    savedAt?: unknown;
    sha256?: unknown;
  } | undefined;
  const runId = runMetadata?.id;
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
      evidence?: Array<{ref?: unknown; sha256?: unknown}>;
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
  const experimentSpecEvidence = runRecord.evidence?.find(
    (evidence) => evidence.ref === "experiment-spec",
  );
  const canonicalRecordSha256 = runRecord.seal?.canonicalSha256;
  assert(
    typeof experimentSpecEvidence?.sha256 === "string"
      && typeof runMetadata?.sha256 === "string"
      && typeof canonicalRecordSha256 === "string",
    "packaged CLI did not expose experiment lineage hashes",
  );
  assert(
    runIntegrity?.status === "verified" && runIntegrity.issueCount === 0,
    "packaged CLI run integrity check failed",
  );
  packageRunRoundTrip = true;

  const experimentOutcomeArguments = {
    kind: "intel",
    target: "Package Smoke Game",
    id: "Experiment Package Smoke 001 Outcome",
    sourceTool: "manual",
    payload: {
      schemaVersion: 1,
      artifactType: "experiment-outcome",
      experimentId: "package-smoke-001",
      targetId: "package-smoke-game",
      specRef: {
        target: "package-smoke-game",
        id: "experiment-package-smoke-001-spec",
        sha256: experimentSpecEvidence.sha256,
      },
      predictionRunRef: {
        target: "package-smoke-game",
        runId,
        runArtifactSha256: runMetadata.sha256,
        canonicalRecordSha256,
      },
      measurementEvidence: [],
      results: [{
        metricId: "task-completion",
        scenarioId: "current",
        status: "missing",
        source: "ai-playtest",
        instrument: "package smoke playtest protocol v1",
        unit: "boolean/session",
        cohort: "single package smoke client",
        window: "15 minute checkpoint task",
        sampleSize: 0,
        evidenceRefs: [],
      }],
      criterionVerdicts: [{
        criterionId: "checkpoint-completed",
        verdict: "unresolved",
      }],
      guardrailVerdicts: [],
      overallVerdict: "unresolved",
      deviations: [{
        field: "playable-build",
        planned: "available",
        actual: "missing",
        reason: "Package smoke does not start or operate a game",
      }],
      learnings: [{
        claim: "Artifact wiring succeeded while the game hypothesis remains unresolved",
        basis: "Verified run integrity and missing task-completion result",
        nextAction: "Repeat prospectively with a playable build",
      }],
    },
  } as const;
  const experimentOutcome = await client.callTool({
    name: "save_artifact",
    arguments: experimentOutcomeArguments,
  });
  assert(experimentOutcome.isError !== true, "packaged CLI could not save experiment outcome");
  const duplicateExperimentOutcome = await client.callTool({
    name: "save_artifact",
    arguments: experimentOutcomeArguments,
  });
  assert(
    duplicateExperimentOutcome.isError === true,
    "packaged CLI allowed experiment outcome replacement without overwrite",
  );
  const experimentOutcomeRead = await client.callTool({
    name: "get_artifact",
    arguments: {
      kind: "intel",
      target: "Package Smoke Game",
      id: "Experiment Package Smoke 001 Outcome",
    },
  });
  const outcomeRecord = experimentOutcomeRead.structuredContent?.data as {
    observedAt?: unknown;
    payload?: {
      artifactType?: unknown;
      overallVerdict?: unknown;
      specRef?: {sha256?: unknown};
      predictionRunRef?: {
        runArtifactSha256?: unknown;
        canonicalRecordSha256?: unknown;
      };
      results?: Array<{
        status?: unknown;
        cohort?: unknown;
        window?: unknown;
        value?: unknown;
      }>;
    };
  } | undefined;
  const outcomePayload = outcomeRecord?.payload;
  assert(
    experimentOutcomeRead.isError !== true
      && typeof runMetadata?.savedAt === "string"
      && typeof outcomeRecord?.observedAt === "string"
      && Date.parse(outcomeRecord.observedAt) >= Date.parse(runMetadata.savedAt)
      && outcomePayload?.artifactType === "experiment-outcome"
      && outcomePayload.overallVerdict === "unresolved"
      && outcomePayload.specRef?.sha256 === experimentSpecEvidence.sha256
      && outcomePayload.predictionRunRef?.runArtifactSha256 === runMetadata.sha256
      && outcomePayload.predictionRunRef?.canonicalRecordSha256 === canonicalRecordSha256
      && outcomePayload.results?.[0]?.status === "missing"
      && outcomePayload.results[0]?.cohort === "single package smoke client"
      && outcomePayload.results[0]?.window === "15 minute checkpoint task"
      && outcomePayload.results[0]?.value === undefined,
    "packaged experiment outcome did not preserve unresolved hash-linked evidence",
  );
  experimentLoopRoundTrip = true;

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

    const updates = await client.callTool({
      name: "steam_updates",
      arguments: {appid: 1145360, scope: "updates", limit: 8, contentChars: 600},
    });
    assert(updates.isError !== true, "packaged CLI steam_updates returned a tool error");
    const updateItems = (updates.structuredContent?.data as {
      items?: Array<{
        official?: unknown;
        isUpdateLike?: unknown;
        updateEvidence?: unknown;
        updateConfidence?: unknown;
        typeConfidence?: unknown;
        platformHints?: unknown;
      }>;
    } | undefined)?.items;
    const updateHandle = (updates.structuredContent?.meta as {
      resultHandle?: unknown;
    } | undefined)?.resultHandle;
    assert(
      (updateItems?.length ?? 0) > 0
      && updateItems?.every((item) =>
        item.official === true
        && item.isUpdateLike === true
        && (item.updateEvidence === "steam-tag" || item.updateEvidence === "title-inference")
        && typeof item.updateConfidence === "number"
        && typeof item.typeConfidence === "number"
        && Array.isArray(item.platformHints)),
      "packaged CLI steam_updates returned no classified official updates",
    );
    assert(typeof updateHandle === "string", "steam_updates result handle is missing");
    const savedUpdates = await client.callTool({
      name: "save_artifact",
      arguments: {
        kind: "intel",
        target: "Hades",
        id: "Live Updates Exact",
        resultHandle: updateHandle,
      },
    });
    assert(savedUpdates.isError !== true, "steam_updates exact save returned a tool error");
    const readUpdates = await client.callTool({
      name: "get_artifact",
      arguments: {kind: "intel", target: "Hades", id: "Live Updates Exact"},
    });
    const updateRecord = readUpdates.structuredContent?.data as {
      sourceTool?: unknown;
      payload?: unknown;
    } | undefined;
    assert(updateRecord?.sourceTool === "steam_updates", "steam_updates sourceTool was not retained");
    assert(
      JSON.stringify(updateRecord.payload) === JSON.stringify(updates.structuredContent),
      "saved steam_updates payload is not the exact normalized tool envelope",
    );
    liveUpdates = true;
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
    experimentLoopRoundTrip,
    liveUpdates,
    liveExactSave,
  }));
} catch (error) {
  if (stderr.trim()) console.error(`server stderr: ${stderr.trim().slice(-1_000)}`);
  throw error;
} finally {
  if (connected) await client.close();
  await rm(temporaryRoot, {recursive: true, force: true});
}
