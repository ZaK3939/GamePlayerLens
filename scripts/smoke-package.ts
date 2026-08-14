import {access, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import {canonicalSha256} from "../src/integrity.js";
import {
  assert,
  playtestCohortFixture,
  stringEnvironment,
} from "./smoke-support.js";

function evaluationMarkdown(detail: string): string {
  return [
    "# Package run evaluation",
    "- Mode: baseline",
    "- Selected Domains: gameplay",
    "## Decision Card",
    "- Verdict: HOLD",
    "- Decision: investigate",
    `- Proven: E-001 — ${detail}`,
    "- Unproven: missing — Player response is not measured.",
    "- Highest risk: Package evidence could be mistaken for player evidence.",
    "- Player problem: The target player and observed friction are unknown.",
    "- Next validation: Test: read back the package run | Success signal: all hashes match | Guardrail: make no player claim",
    "- Confidence: low because player evidence is missing.",
    "- Revisit condition: Direct player evidence is saved.",
    "## Detailed Scope", "Packaged MCP transport fixture.",
    "## Indie Survival Strategy", "適用外: This fixture tests package wiring only.",
    "## Overall Assessment", "Synthetic assessment.",
    "## Who Plays and Why — Flow Analysis", "Synthetic player flow.",
    "## Flow Summary", "Synthetic flow summary.",
    "## Domain Findings", "Synthetic domain finding.", "- Severity: Important",
    "## Data Semantics", "Synthetic data semantics.",
    "## Data Coverage Matrix",
    [
      "| Domain | Dimension | Status | Evidence IDs | Limitation / mismatch | Decision impact |",
      "|---|---|---|---|---|---|",
      "| gameplay | player-facing core loop | missing | なし | package fixture | no product claim |",
      "| gameplay | progression and reward | missing | なし | package fixture | no product claim |",
      "| gameplay | failure and retry | missing | なし | package fixture | no product claim |",
      "| gameplay | player response | missing | なし | package fixture | no product claim |",
    ].join("\n"),
    [
      "| Scope | Applicable dimensions | Observed | Reported-zero | Estimated | Missing | Coverage rate | Direct observation rate |",
      "|---|---|---|---|---|---|---|---|",
      "| gameplay | 4 | 0 | 0 | 0 | 4 | 0.0% | 0.0% |",
      "| overall | 4 | 0 | 0 | 0 | 4 | 0.0% | 0.0% |",
    ].join("\n"),
    "Blocking missing dimensions: all fixture dimensions are intentionally missing.",
    "## Evidence Index",
    [
      "| Evidence ID | artifact repository-relative path | observedAt | source | Data status / warning |",
      "|---|---|---|---|---|",
      "| E-001 | `knowledge/intel/package-game/snapshot.json` | 2026-08-11T09:10:11.000Z | manual | observed; synthetic fixture |",
    ].join("\n"),
    "## Final Recommendation", detail,
  ].join("\n\n");
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
  join(repositoryRoot, "knowledge", "templates", "review-eval.md"),
  join(repositoryRoot, "knowledge", "rubrics", "harsh-critic.md"),
  join(repositoryRoot, "knowledge", "rubrics", "evidence-coverage.md"),
  join(repositoryRoot, "knowledge", "rubrics", "playtest.md"),
  join(repositoryRoot, "knowledge", "rubrics", "update-strategy.md"),
  join(repositoryRoot, "knowledge", "rubrics", "experiment.md"),
  join(repositoryRoot, "knowledge", "rubrics", "indie-survival-strategy.md"),
  join(repositoryRoot, "skills", "game-review.md"),
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
let liveBrief = false;
let liveUpdates = false;
let packageRunRoundTrip = false;
let playtestPromptRoundTrip = false;
let playtestCohortRoundTrip = false;
let experimentLoopRoundTrip = false;
try {
  await client.connect(transport);
  connected = true;
  const tools = (await client.listTools()).tools;
  const prompts = (await client.listPrompts()).prompts;
  assert(tools.length === 15, "packaged CLI did not expose fifteen tools");
  assert(
    JSON.stringify(prompts.map((prompt) => prompt.name).sort())
      === JSON.stringify(["audit-project", "review-change", "ui-blind-compare"]),
    "packaged CLI did not expose the review prompt surface",
  );

  const status = await client.callTool({name: "get_status", arguments: {}});
  const statusJson = JSON.stringify(status.structuredContent);
  assert(status.isError !== true, "packaged CLI could not report status");
  assert(
    statusJson.includes('"location":"external-data-home"')
      && statusJson.includes('"writable":true')
      && statusJson.includes('"toolCount":15')
      && !statusJson.includes(dataRoot)
      && !(process.env.ITAD_API_KEY?.trim()
        && statusJson.includes(process.env.ITAD_API_KEY))
      && !(process.env.OBSCURA_PATH?.trim()
        && statusJson.includes(process.env.OBSCURA_PATH)),
    "packaged get_status exposed sensitive configuration or returned incomplete readiness metadata",
  );

  const knowledge = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "templates", id: "review-eval.md"},
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
      && indieSurvivalContent.includes("Core Legibility Gate")
      && indieSurvivalContent.includes("Core Revision Ledger")
      && indieSurvivalContent.includes("First-contact Asset Readiness")
      && indieSurvivalContent.includes("partner.steamgames.com/doc/marketing/upcoming_events/nextfest"),
    "packaged CLI returned the wrong indie survival strategy rubric",
  );

  const firstContactRecord = await client.callTool({
    name: "record_first_contact",
    arguments: {
      testedAt: "2026-08-12T11:00:00+04:00",
      assetId: "package-viewport-v1",
      assetType: "store-viewport",
      assetDescription: "First visible store viewport",
      exposure: {
        device: "desktop",
        viewport: "1440x900",
        durationSeconds: 20,
        sound: "not-applicable",
      },
      recruitment: "External action-game players",
      targetPlayerDefinition: "Players learning a new action loop",
      participants: [{
        participantId: "p-02",
        targetFit: "medium",
        visualQuality: "rough",
        visualQualityReason: "The checkpoint action does not yet read as production-ready",
        understoodTheme: "yes",
        themeAppeal: "unclear",
        themeAppealReason: "The theme is legible but this asset does not show enough to judge taste fit",
        understoodAction: "unclear",
        understoodReward: "no",
        tryIntent: "no",
        tryIntentReason: "The repeated action and reward are not visible",
        immediateReject: "yes",
        unaidedSummary: "A checkpoint game with an unclear action",
        rejectionReason: "The repeated action is not visible",
        confusions: ["What I control"],
      }],
    },
  });
  assert(firstContactRecord.isError !== true, "packaged record_first_contact failed");
  const firstContactResultHandle = (
    firstContactRecord.structuredContent?.meta as {resultHandle?: string} | undefined
  )?.resultHandle;
  assert(firstContactResultHandle !== undefined, "packaged first-contact handle is missing");

  const playtestPrompt = await client.getPrompt({
    name: "audit-project",
    arguments: {
      target: "Package Smoke Game",
      topic: "Playtest protocol wiring",
      subjectKind: "developer-project",
      domains: "gameplay",
      projectBrief: JSON.stringify({
        revisionId: "brief-v1",
        developmentStage: "prototype",
        conceptOrigin: "theme-first",
        targetPlayer: "players learning a new action loop",
        themeWorld: "a compact checkpoint trial",
        distinctiveSystem: "read a signal and choose the matching action",
        primaryIntendedFeeling: "tension resolving into earned relief",
        shortestRepeatableLoop: "read one state, choose one action, resolve it, and return to the next choice",
        systemResponse: "the checkpoint reacts immediately to the chosen action",
        rewardMechanisms: [{
          family: "mastery",
          form: "mixed",
          beforeState: "the checkpoint response is uncertain",
          playerAction: "read the signal and commit to an action",
          systemResponse: "the checkpoint confirms or rejects the action",
          afterState: "the player can identify whether the action succeeded",
          perceivedReward: "learning the action loop advances the run",
          amplifier: "a distinct flash and sound",
        }],
        oneSentencePromise: "Learn the loop and reach the checkpoint",
        coreProofMoment: "The player reads one signal, acts, and receives an immediate checkpoint response",
        runwayMonths: 6,
      }),
      auditSnapshotBundle: JSON.stringify({
        artifactType: "audit-snapshot-bundle",
        observedAt: "2026-08-12T12:05:00+04:00",
        snapshotId: "package-smoke-build",
        gitCommitSha: "a".repeat(40),
        buildId: "package-smoke-fixture-1",
        artifacts: [{
          evidenceRef: "package-capture",
          kind: "capture",
          sha256: "1".repeat(64),
        }],
      }),
      conceptTest: JSON.stringify({
        testedAt: "2026-08-12T10:00:00+04:00",
        stimulusId: "package-pitch-v1",
        parentStimulusId: "package-pitch-v0",
        changeSummary: "Reduced the pitch to one repeated action",
        changedVariables: ["presentation"],
        invariantsKept: ["Same audience, questions, and exposure protocol"],
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
          understoodTheme: "yes",
          themeSystemFit: "unclear",
          themeSystemFitReason: "The checkpoint theme is visible, but its connection to the action loop is incomplete",
          understoodAction: "yes",
          understoodReward: "unclear",
          interest: "maybe",
          unaidedSummary: "Read, act, and recover until the checkpoint",
          confusions: ["The checkpoint reward was unclear"],
        }],
      }),
      firstContactResultHandle,
      playtestUrl: "http://127.0.0.1:4173/play#package-smoke",
      playtestTask: "Reach the first checkpoint",
      playtestBuild: "package-smoke-fixture-1",
      playtestControls: "keyboard and mouse",
      playtestDurationMinutes: "15",
      playtestSession: JSON.stringify({
        startedAt: "2026-08-12T12:00:00+04:00",
        endedAt: "2026-08-12T12:05:00+04:00",
        sessionId: "package-playtest-p03",
        parentSessionId: "package-playtest-p02",
        changeSummary: "Made checkpoint reward feedback distinct",
        changedVariables: ["reward"],
        invariantsKept: ["Same task, platform, controls, cohort, and moderation script"],
        buildId: "package-smoke-fixture-1",
        executionEnvironment: {
          operatingSystem: "Ubuntu 24.04",
          device: "CI desktop fixture",
          runtime: "Chromium 140",
          rendererBackend: "webgl2",
          rendererImplementation: "ANGLE Vulkan (SwiftShader Device)",
          graphicsAcceleration: "software",
          viewport: {width: 1280, height: 720, devicePixelRatio: 1},
        },
        controls: "keyboard and mouse",
        task: "Reach the first checkpoint",
        startState: "Fresh save at the title screen",
        endState: "First checkpoint reached",
        testerType: "human-participant",
        participantId: "p-03",
        targetFit: "medium",
        observationSource: "moderated",
        priorKnowledge: "none",
        observations: [{
          step: 1,
          elapsedSeconds: 20,
          eventType: "reward",
          meaningfulAction: true,
          playerIntent: "Complete the first action",
          inputAction: "Used the prompted keyboard input",
          systemResponse: "Checkpoint progress appeared without a distinct sound cue",
          frictionSeverity: "minor",
          rewardSignal: "unclear",
          evidenceIds: ["package-capture-001"],
        }],
        outcome: "completed",
        humanReport: {
          feltReward: "unclear",
          rewardDescription: "The visual progress appeared, but the reward was not distinct",
          wouldRepeat: "maybe",
          confusions: ["Whether the checkpoint granted a reward"],
        },
      }),
      market: "United States",
      language: "english",
    },
  });
  const playtestContent = playtestPrompt.messages[0]?.content;
  assert(playtestContent?.type === "text", "packaged audit-project did not return text");
  assert(
    playtestContent.text.includes('"playtestUrl": "http://127.0.0.1:4173/play#package-smoke"')
      && playtestContent.text.includes('"projectBrief": {')
      && playtestContent.text.includes('"projectBriefDiagnostics": {')
      && playtestContent.text.includes('"status": "inventory-only"')
      && playtestContent.text.includes('"rewardMechanism": {')
      && playtestContent.text.includes('"status": "declared-mechanisms-ready-for-validation"')
      && playtestContent.text.includes('"conceptTest": {')
      && playtestContent.text.includes('"conceptTestDiagnostics": {')
      && playtestContent.text.includes('"revisionStatus": "matched"')
      && playtestContent.text.includes('"promiseStatus": "matched"')
      && playtestContent.text.includes('"conceptTestEvidence": {')
      && playtestContent.text.includes('"exactSaveRequired": true')
      && playtestContent.text.includes('"status": "descriptive-only"')
      && playtestContent.text.includes('"participantCount": 1')
      && playtestContent.text.includes('"unaidedSummaryCount": 1')
      && playtestContent.text.includes('"status": "linked-revision"')
      && playtestContent.text.includes('"parentStimulusId": "package-pitch-v0"')
      && playtestContent.text.includes('"firstContactTest": {')
      && playtestContent.text.includes('"firstContactTestDiagnostics": {')
      && playtestContent.text.includes('"firstContactTestEvidence": {')
      && playtestContent.text.includes('"visualQualityCounts": {')
      && playtestContent.text.includes('"themeAppealCounts": {')
      && playtestContent.text.includes('"tryIntentCounts": {')
      && playtestContent.text.includes('"immediateRejectCounts": {')
      && playtestContent.text.includes('"developmentStage": "prototype"')
      && playtestContent.text.includes('"runwayMonths": 6')
      && playtestContent.text.includes('"playtestTask": "Reach the first checkpoint"')
      && playtestContent.text.includes('"playtestBuild": "package-smoke-fixture-1"')
      && playtestContent.text.includes('"playtestControls": "keyboard and mouse"')
      && playtestContent.text.includes('"playtestDurationMinutes": "15"')
      && playtestContent.text.includes('"playtestSession": {')
      && playtestContent.text.includes('"playtestSessionDiagnostics": {')
      && playtestContent.text.includes('"playtestSessionEvidence": {')
      && playtestContent.text.includes('"humanEvidenceStatus": "human-report-present"')
      && playtestContent.text.includes('"parentSessionId": "package-playtest-p02"')
      && playtestContent.text.includes('"status": "linked-retest"')
      && playtestContent.text.includes('"causalAttributionStatus": "comparison-candidate-only"')
      && playtestContent.text.includes('"intakeDiagnostics": {\n    "status": "ready"')
      && playtestContent.text.includes('"selectedDomains": [\n    "gameplay"\n  ]'),
    "packaged audit-project did not round-trip the playtest protocol",
  );
  playtestPromptRoundTrip = true;

  const cohortPrompt = await client.getPrompt({
    name: "audit-project",
    arguments: {
      target: "Package Cohort Fixture Game",
      topic: "Bounded playtest cohort wiring",
      subjectKind: "existing-game",
      domains: "gameplay",
      playtestCohort: JSON.stringify(playtestCohortFixture("package")),
    },
  });
  const cohortContent = cohortPrompt.messages[0]?.content;
  assert(cohortContent?.type === "text", "packaged audit-project cohort prompt did not return text");
  assert(
    cohortContent.text.includes('"playtestCohort": {')
      && cohortContent.text.includes('"playtestCohortDiagnostics": {')
      && cohortContent.text.includes('"artifactId": "playtest-cohort-package-cohort-01"')
      && cohortContent.text.includes('"playtestCohortEvidence": {')
      && cohortContent.text.includes('"observedAt": "2026-08-13T12:04:00+04:00"')
      && cohortContent.text.includes('"evidenceByTesterType": {')
      && cohortContent.text.includes('"ai-operated": {')
      && cohortContent.text.includes('"internalParentCount": 1')
      && cohortContent.text.includes('"comparisonStatus": "comparison-candidate-only"')
      && cohortContent.text.includes('"participantExposure": "ai-operated-pair"')
      && cohortContent.text.includes('"evidenceTransition": {')
      && !cohortContent.text.includes('"completionRate"'),
    "packaged audit-project did not preserve bounded cohort evidence separation",
  );
  playtestCohortRoundTrip = true;

  const packageResearchQuestions = [{
    id: "promise-readability",
    question: "Which signals make the first meaningful action and result readable?",
    evidenceSignals: ["package smoke voice"],
  }] as const;
  const packageTargetSource = {
    appid: 1145360,
    role: "target",
    fitRole: "target-game",
    matchedAxes: ["player-problem"],
    researchQuestionIds: ["promise-readability"],
    rationale: "Target reviews directly describe the readability problem under review.",
  } as const;
  const packageGeneratedPersona = {
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
    schema_version: 3,
    target_context: {
      market: "United States",
      language: "english",
      research_questions: packageResearchQuestions,
      source_roles: [packageTargetSource],
    },
    decision_profile: {
      adoption_trigger: "The first meaningful action is clear",
      retention_trigger: "The action continues to create readable outcomes",
      churn_trigger: "The value proposition or action becomes unclear",
      update_reaction: "Reassess after the changed experience is demonstrated",
    },
    evidence_basis: {
      observed_patterns: [
        {
          research_question_id: "promise-readability",
          claim: "A clear promise affects adoption",
          evidence: [{
            source_appid: 1145360,
            recommendation_id: "package-smoke-1",
            relevance: "The review directly connects a clear promise to adoption.",
          }],
        },
        {
          research_question_id: "promise-readability",
          claim: "Unclear value is a dealbreaker",
          evidence: ["package-smoke-2", "package-smoke-3"].map((recommendation_id) => ({
            source_appid: 1145360,
            recommendation_id,
            relevance: "The review directly evaluates whether the action or value is clear.",
          })),
        },
      ],
      inferred_traits: [],
      limitations: ["Synthetic package fixture does not represent a population"],
      overall_confidence: "low",
    },
  } as const;
  const rejectedUngroundedPersona = await client.callTool({
    name: "save_persona",
    arguments: {
      persona: packageGeneratedPersona,
    },
  });
  assert(
    rejectedUngroundedPersona.isError === true,
    "packaged CLI allowed persona persistence without a derivation result handle",
  );
  const packageDerivationPayload = {
    data: {
      requestedCount: 1,
      generationReadiness: {
        status: "ready",
        generationAllowed: true,
        requestedCount: 1,
        supportedCount: 1,
        availableUniqueReviewCount: 3,
        requiredUniqueReviewCount: 3,
        minimumUniqueReviewsPerPersona: 3,
        voiceReuseAllowed: false,
      },
      schema: {},
      brief: {
        targetAppid: 1145360,
        market: "United States",
        language: "english",
        focus: ["adoption"],
        researchQuestions: packageResearchQuestions,
        sources: [packageTargetSource],
      },
      games: [],
      reviews: packageGeneratedPersona.voice.map((voice) => ({
        sourceAppid: voice.source_appid,
        sourceRole: "target",
        recommendationId: voice.recommendation_id,
        review: voice.text,
        votedUp: voice.voted_up,
        language: voice.language,
        matchedResearchQuestionIds: ["promise-readability"],
        matchedEvidenceSignals: ["package smoke voice"],
        playtimeHours: 1,
        timestamp: "2026-08-10T00:00:00.000Z",
      })),
      instruction: "Synthetic package fixture; no Steam request was made",
    },
    warnings: ["Synthetic package fixture; no Steam request was made"],
    meta: {
      observedAt: "2026-08-11T00:00:00.000Z",
      resultHandle: "33333333-3333-4333-8333-333333333333",
    },
  } as const;
  const personaDerivation = await client.callTool({
    name: "save_artifact",
    arguments: {
      kind: "intel",
      target: "Package Smoke Game",
      id: "Persona Derivation Fixture",
      sourceTool: "derive_personas",
      observedAt: packageDerivationPayload.meta.observedAt,
      payload: packageDerivationPayload,
    },
  });
  assert(personaDerivation.isError !== true, "packaged CLI could not save persona derivation");
  await writeFile(
    join(dataRoot, "knowledge", "personas", "package-smoke-player.json"),
    `${JSON.stringify({
      ...packageGeneratedPersona,
      grounding: {
        sourceTool: "derive_personas",
        observedAt: packageDerivationPayload.meta.observedAt,
        resultSha256: canonicalSha256(packageDerivationPayload),
      },
    }, null, 2)}\n`,
    "utf8",
  );
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
      content: evaluationMarkdown("Synthetic protocol fixture only. No game was operated."),
    },
  });
  assert(evaluation.isError !== true, "packaged CLI could not save run evaluation");
  const run = await client.callTool({
    name: "save_artifact",
    arguments: {
      kind: "run",
      target: "Package Smoke Game",
      topic: "Package run",
      subjectKind: "existing-game",
      market: "United States",
      language: "english",
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
          ref: "derivation",
          kind: "intel",
          target: "Package Smoke Game",
          id: "Persona Derivation Fixture",
        },
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
          playerSimulation: {
            exposure: "scenario-only",
            stimulusEvidenceRefs: [],
            memory: {
              derivationEvidenceRef: "derivation",
              voiceEvidence: [{sourceAppid: 1145360, recommendationId: "package-smoke-1"}],
            },
            perception: {
              expectation: "The fixture should expose a readable gameplay promise.",
              noticedSignals: ["The protocol describes one checkpoint task."],
              unclearSignals: ["No gameplay response was observed."],
            },
            decision: {
              action: "Wait for a playable proof before judging the loop.",
              reason: "The persona needs a clear value proposition.",
            },
            response: {
              predictedFeeling: {
                before: "Uncertain about the fixture's gameplay promise.",
                after: "Still uncertain because the fixture contains no observed play.",
              },
              frictions: ["The core action is not demonstrated."],
              rewardSignals: [],
              continuation: "uncertain",
              continuationReason: "The protocol alone cannot establish player response.",
            },
            reflection: {
              confidence: "low",
              uncertainties: ["No human or AI-operated session was completed."],
              humanValidationQuestion: "What do you expect to do at the checkpoint?",
              observableSignal: "A participant identifies the action without prompting.",
            },
          },
          output: "The fixture proves protocol transport only and contains no observed play.",
          evidenceRefs: ["derivation", "experiment-spec", "playtest-protocol"],
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
    simulationReadinessStatus?: unknown;
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
      schemaVersion?: unknown;
      subjectKind?: unknown;
      market?: unknown;
      language?: unknown;
      recipe?: {sha256?: unknown};
      coverage?: {scenarioDomain?: {ratio?: unknown}};
      seal?: {canonicalSha256?: unknown};
      model?: {reportedByClient?: unknown};
      confidence?: {reportedByClient?: unknown};
      simulationReadiness?: {
        status?: unknown;
        serverAssessed?: unknown;
        heldOutValidation?: {
          status?: unknown;
          matchedExperimentSpecRefs?: unknown[];
        };
        calibration?: {serverVerified?: unknown};
        allowedClaims?: unknown[];
        blockedClaims?: unknown[];
      };
      evidence?: Array<{ref?: unknown; sha256?: unknown; artifactType?: unknown}>;
      rounds?: unknown[];
    };
    integrity?: {status?: unknown; issueCount?: unknown};
  } | undefined)?.record;
  const runIntegrity = (runRead.structuredContent?.data as {
    integrity?: {status?: unknown; issueCount?: unknown};
  } | undefined)?.integrity;
  const packagePlayerSimulation = (runRecord?.rounds?.[0] as {
    playerSimulation?: {
      stimulusEvidenceRefs?: unknown[];
      memory?: {derivationEvidenceRef?: unknown; voiceEvidence?: unknown[]};
      response?: {predictedFeeling?: {before?: unknown; after?: unknown}};
      reflection?: {humanValidationQuestion?: unknown; observableSignal?: unknown};
    };
  } | undefined)?.playerSimulation;
  assert(runRead.isError !== true, "packaged CLI could not read a simulation run");
  assert(runRecord?.runId === runId, "packaged CLI returned the wrong run");
  assert(
    runMetadata?.simulationReadinessStatus === "validation-ready"
      && runRecord.schemaVersion === 10
      && runRecord.subjectKind === "existing-game"
      && runRecord.market === "United States"
      && runRecord.language === "english"
      && typeof runRecord.recipe?.sha256 === "string"
      && runRecord.model?.reportedByClient === true
      && runRecord.confidence?.reportedByClient === true
      && runRecord.coverage?.scenarioDomain?.ratio === 1
      && runRecord.simulationReadiness?.status === "validation-ready"
      && runRecord.simulationReadiness.serverAssessed === true
      && runRecord.simulationReadiness.heldOutValidation?.status === "planned"
      && runRecord.simulationReadiness.heldOutValidation.matchedExperimentSpecRefs
        ?.includes("experiment-spec")
      && runRecord.simulationReadiness.calibration?.serverVerified === false
      && runRecord.simulationReadiness.allowedClaims?.includes("preregistered-prediction")
      && runRecord.simulationReadiness.blockedClaims?.includes("causal-lift")
      && typeof runRecord.seal?.canonicalSha256 === "string"
      && runRecord.rounds?.length === 4
      && packagePlayerSimulation?.stimulusEvidenceRefs?.length === 0
      && packagePlayerSimulation?.memory?.derivationEvidenceRef === "derivation"
      && packagePlayerSimulation?.memory?.voiceEvidence?.length === 1
      && typeof packagePlayerSimulation.response?.predictedFeeling?.before === "string"
      && typeof packagePlayerSimulation.response.predictedFeeling.after === "string"
      && typeof packagePlayerSimulation.reflection?.humanValidationQuestion === "string"
      && typeof packagePlayerSimulation.reflection.observableSignal === "string",
    "packaged CLI run record is incomplete",
  );
  const experimentSpecEvidence = runRecord.evidence?.find(
    (evidence) => evidence.ref === "experiment-spec",
  );
  const canonicalRecordSha256 = runRecord.seal?.canonicalSha256;
  assert(
    experimentSpecEvidence?.artifactType === "experiment-spec"
      && typeof experimentSpecEvidence.sha256 === "string"
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
        aggregation: "proportion",
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

  const nextExperimentSpec = await client.callTool({
    name: "save_artifact",
    arguments: {
      ...experimentSpecArguments,
      id: "Experiment Package Smoke 002 Spec",
      payload: {
        ...experimentSpecArguments.payload,
        experimentId: "package-smoke-002",
        parentOutcomeRef: {
          target: "package-smoke-game",
          id: "experiment-package-smoke-001-outcome",
        },
      },
      observedAt: new Date().toISOString(),
    },
  });
  assert(nextExperimentSpec.isError !== true, "packaged CLI could not save next experiment spec");
  const nextRun = await client.callTool({
    name: "save_artifact",
    arguments: {
      kind: "run",
      target: "Package Smoke Game",
      topic: "Package calibration readback",
      subjectKind: "existing-game",
      market: "United States",
      language: "english",
      mode: "baseline",
      selectedDomains: ["gameplay"],
      model: {provider: "smoke", name: "package-client"},
      scenarios: experimentSpecArguments.payload.plannedScenarios,
      personaIds: ["package-smoke-player"],
      evidence: [
        {
          ref: "derivation",
          kind: "intel",
          target: "Package Smoke Game",
          id: "Persona Derivation Fixture",
        },
        {
          ref: "next-experiment-spec",
          kind: "intel",
          target: "Package Smoke Game",
          id: "Experiment Package Smoke 002 Spec",
        },
        {
          ref: "prior-experiment-outcome",
          kind: "intel",
          target: "Package Smoke Game",
          id: "Experiment Package Smoke 001 Outcome",
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
          playerSimulation: {
            exposure: "scenario-only",
            stimulusEvidenceRefs: [],
            memory: {
              derivationEvidenceRef: "derivation",
              voiceEvidence: [{sourceAppid: 1145360, recommendationId: "package-smoke-2"}],
            },
            perception: {
              expectation: "The prior outcome should clarify whether the prediction held.",
              noticedSignals: ["The prior outcome is unresolved."],
              unclearSignals: ["No raw measurement explains player behavior."],
            },
            decision: {
              action: "Request a new playable measurement before changing the game.",
              reason: "An unresolved outcome cannot update the persona's expectation.",
            },
            response: {
              predictedFeeling: {
                before: "Interested in whether the prior prediction held.",
                after: "Cautious because the claimed outcome lacks observation.",
              },
              frictions: ["The evidence chain has no behavioral result."],
              rewardSignals: [],
              continuation: "uncertain",
              continuationReason: "A completed session is required.",
            },
            reflection: {
              confidence: "low",
              uncertainties: ["The held-out player response remains unknown."],
              humanValidationQuestion: "Did the changed experience alter your next action?",
              observableSignal: "A recorded action differs under the preregistered protocol.",
            },
          },
          output: "The prior outcome is unresolved and cannot calibrate the forecast.",
          evidenceRefs: [
            "derivation",
            "next-experiment-spec",
            "prior-experiment-outcome",
            "playtest-protocol",
          ],
        },
        {
          sequence: 2,
          phase: "domain",
          actor: "gameplay-reviewer",
          domain: "gameplay",
          scenarioId: "current",
          output: "No raw gameplay measurement exists for the prior prediction.",
          evidenceRefs: ["next-experiment-spec", "prior-experiment-outcome", "playtest-protocol"],
        },
        {
          sequence: 3,
          phase: "critic",
          actor: "harsh-critic",
          output: "A valid hash chain cannot turn a missing result into an observation.",
          evidenceRefs: ["next-experiment-spec", "prior-experiment-outcome", "playtest-protocol"],
        },
        {
          sequence: 4,
          phase: "synthesis",
          actor: "lead-synthesizer",
          output: "Keep server calibration false and repeat with a playable build.",
          evidenceRefs: ["next-experiment-spec", "prior-experiment-outcome", "playtest-protocol"],
        },
      ],
      warnings: ["No raw measurement exists; the prior outcome is unresolved"],
      confidence: {
        level: "low",
        basis: "Hash-chain transport is present but the primary result is missing",
        calibrationStatus: "partially-calibrated",
      },
      finalEvaluationRef: "evaluation",
    },
  });
  assert(nextRun.isError !== true, "packaged CLI could not run Outcome verification");
  const nextRunId = (nextRun.structuredContent?.data as {id?: unknown} | undefined)?.id;
  assert(typeof nextRunId === "string", "packaged Outcome verification run id is missing");
  const nextRunRead = await client.callTool({
    name: "get_artifact",
    arguments: {kind: "run", target: "Package Smoke Game", id: nextRunId},
  });
  const nextReadiness = (nextRunRead.structuredContent?.data as {
    record?: {simulationReadiness?: {
      calibration?: {
        serverVerified?: unknown;
        outcomeChecks?: Array<{ref?: unknown; status?: unknown; issues?: unknown[]}>;
        forecastComparisons?: unknown[];
      };
      experimentDecisions?: Array<{
        outcomeRef?: unknown;
        status?: unknown;
        serverOverallVerdict?: unknown;
        recommendedAction?: unknown;
        reportedOverallVerdict?: unknown;
        reportedVerdictsMatch?: unknown;
      }>;
      heldOutValidation?: {verifiedExperimentOutcomeRefs?: unknown[]};
    }};
    integrity?: {status?: unknown};
  } | undefined);
  assert(
    nextRunRead.isError !== true
      && nextReadiness?.integrity?.status === "verified"
      && nextReadiness.record?.simulationReadiness?.calibration?.serverVerified === false
      && nextReadiness.record.simulationReadiness.calibration.outcomeChecks?.[0]?.ref
        === "prior-experiment-outcome"
      && nextReadiness.record.simulationReadiness.calibration.outcomeChecks[0]?.status
        === "unresolved"
      && nextReadiness.record.simulationReadiness.calibration.forecastComparisons?.length === 0
      && nextReadiness.record.simulationReadiness.experimentDecisions?.[0]?.outcomeRef
        === "prior-experiment-outcome"
      && nextReadiness.record.simulationReadiness.experimentDecisions[0]?.status
        === "unresolved"
      && nextReadiness.record.simulationReadiness.experimentDecisions[0]
        ?.serverOverallVerdict === "unresolved"
      && nextReadiness.record.simulationReadiness.experimentDecisions[0]
        ?.recommendedAction === "collect-missing-evidence"
      && nextReadiness.record.simulationReadiness.experimentDecisions[0]
        ?.reportedOverallVerdict === "unresolved"
      && nextReadiness.record.simulationReadiness.experimentDecisions[0]
        ?.reportedVerdictsMatch === true
      && nextReadiness.record.simulationReadiness.heldOutValidation
        ?.verifiedExperimentOutcomeRefs?.length === 0,
    "packaged Outcome validator did not preserve missing as an unresolved decision",
  );
  experimentLoopRoundTrip = true;

  if (live) {
    const brief = await client.callTool({
      name: "steam_brief",
      arguments: {appid: 1145360, language: "japanese", country: "JP"},
    });
    assert(brief.isError !== true, "packaged CLI steam_brief returned a tool error");
    const briefEnvelope = brief.structuredContent as {
      data?: {
        target?: {appid?: unknown};
        readiness?: {status?: unknown; unsupportedClaims?: unknown[]};
        provenance?: unknown[];
      };
      meta?: {resultHandle?: unknown};
    } | undefined;
    const resultHandle = briefEnvelope?.meta?.resultHandle;
    assert(
      briefEnvelope?.data?.target?.appid === 1145360
      && briefEnvelope.data.readiness?.status !== "blocked"
      && briefEnvelope.data.readiness?.unsupportedClaims?.includes(
        "gameplay quality without direct playtest evidence",
      )
      && briefEnvelope.data.provenance?.length === 6,
      "packaged CLI steam_brief returned incomplete decision coverage",
    );
    assert(
      Buffer.byteLength(JSON.stringify(brief.structuredContent), "utf8") < 50_000,
      "packaged CLI steam_brief exceeded the 50 KiB first-pass budget",
    );
    assert(typeof resultHandle === "string", "steam_brief result handle is missing");

    const saved = await client.callTool({
      name: "save_artifact",
      arguments: {
        kind: "intel",
        target: "Hades",
        id: "Live Brief Exact",
        resultHandle,
      },
    });
    assert(saved.isError !== true, "result-handle artifact save returned a tool error");
    const read = await client.callTool({
      name: "get_artifact",
      arguments: {kind: "intel", target: "Hades", id: "Live Brief Exact"},
    });
    const record = read.structuredContent?.data as {
      sourceTool?: unknown;
      observedAt?: unknown;
      payload?: unknown;
    } | undefined;
    assert(record?.sourceTool === "steam_brief", "sourceTool was not inferred from handle");
    assert(
      record.observedAt === (brief.structuredContent?.meta as {observedAt?: unknown})?.observedAt,
      "observedAt was not inferred from handle",
    );
    assert(
      JSON.stringify(record.payload) === JSON.stringify(brief.structuredContent),
      "saved payload is not the exact normalized tool envelope",
    );
    liveBrief = true;

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
    playtestCohortRoundTrip,
    packageRunRoundTrip,
    experimentLoopRoundTrip,
    liveBrief,
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
