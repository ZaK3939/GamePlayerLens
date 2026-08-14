import {access, readFile, readdir} from "node:fs/promises";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import {
  assert,
  playtestCohortFixture,
  stringEnvironment,
} from "./smoke-support.js";

const EXPECTED_TOOLS = [
  "derive_personas",
  "get_artifact",
  "get_knowledge",
  "get_status",
  "record_first_contact",
  "save_artifact",
  "save_persona",
  "steam_brief",
  "steam_discover",
  "steam_fetch",
  "steam_reviews",
  "steam_search",
  "steam_timeline",
  "steam_updates",
  "ui_capture",
];
const EXPECTED_PROMPTS = ["audit-project", "play-build", "review-change", "ui-blind-compare"];
const EXPECTED_REVIEW_CHANGE_ARGUMENTS = [
  "target",
  "topic",
  "subjectKind",
  "domains",
  "specification",
  "projectBrief",
  "conceptTest",
  "firstContactResultHandle",
  "playtestSession",
  "playtestCohort",
  "playtestUrl",
  "playtestTask",
  "playtestBuild",
  "playtestControls",
  "playtestDurationMinutes",
  "revisionBundle",
  "uiUrl",
  "uiBenchmarkTask",
  "uiReferenceUrls",
  "currentState",
  "proposal",
  "competitors",
  "market",
  "language",
  "qualityTier",
];
const EXPECTED_AUDIT_PROJECT_ARGUMENTS = EXPECTED_REVIEW_CHANGE_ARGUMENTS.filter(
  (name) => name !== "currentState" && name !== "proposal" && name !== "revisionBundle",
).toSpliced(5, 0, "knownBlockers").toSpliced(16, 0, "auditSnapshotBundle");
const EXPECTED_PLAY_BUILD_ARGUMENTS = [
  "target",
  "buildUrl",
  "buildId",
  "task",
  "controls",
  "startState",
  "endState",
  "coreClaim",
  "timeLimitMinutes",
  "personaIds",
  "knownBlockers",
];

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

  const status = await client.callTool({name: "get_status", arguments: {}});
  const statusJson = JSON.stringify(status.structuredContent);
  assert(status.isError !== true, "get_status returned a tool error");
  assert(
    statusJson.includes('"location":"repository-root"')
      && statusJson.includes('"toolCount":15')
      && statusJson.includes('"promptCount":4')
      && !statusJson.includes(repositoryRoot),
    "get_status did not return safe repository readiness metadata",
  );

  const auditProject = listedPrompts.find((prompt) => prompt.name === "audit-project");
  assert(auditProject !== undefined, "audit-project prompt is missing");
  assert(
    JSON.stringify(auditProject.arguments?.map((argument) => argument.name))
      === JSON.stringify(EXPECTED_AUDIT_PROJECT_ARGUMENTS),
    "unexpected audit-project prompt argument schema",
  );
  assert(
    JSON.stringify(
      auditProject.arguments
        ?.filter((argument) => argument.required)
        .map((argument) => argument.name),
    ) === JSON.stringify(["target", "topic"]),
    "audit-project must require exactly target and topic",
  );
  const reviewChange = listedPrompts.find((prompt) => prompt.name === "review-change");
  assert(reviewChange !== undefined, "review-change prompt is missing");
  assert(
    JSON.stringify(reviewChange.arguments?.map((argument) => argument.name))
      === JSON.stringify(EXPECTED_REVIEW_CHANGE_ARGUMENTS),
    "unexpected review-change prompt argument schema",
  );

  const playBuild = listedPrompts.find((prompt) => prompt.name === "play-build");
  assert(playBuild !== undefined, "play-build prompt is missing");
  assert(
    JSON.stringify(playBuild.arguments?.map((argument) => argument.name))
      === JSON.stringify(EXPECTED_PLAY_BUILD_ARGUMENTS),
    "unexpected play-build prompt argument schema",
  );
  const repairPrompt = await client.getPrompt({
    name: "play-build",
    arguments: {
      target: "Stdio Repair Fixture",
      knownBlockers: "Steering force is reversed\nStress feedback is binary",
    },
  });
  const repairContent = repairPrompt.messages[0]?.content;
  assert(repairContent?.type === "text", "play-build repair route did not return text");
  assert(
    repairContent.type === "text"
      && repairContent.text.includes('"route": "repair-first"')
      && repairContent.text.includes('"status": "repair-first"')
      && repairContent.text.includes('"steam-research"')
      && !repairContent.text.includes("auditSnapshotBundle"),
    "play-build did not short-circuit known blockers",
  );

  const corePrompt = await client.getPrompt({
    name: "play-build",
    arguments: {
      target: "Stdio Core Fixture",
      buildUrl: "http://127.0.0.1:4173/play",
      buildId: "core-001",
      task: "Complete one delivery and inspect the structural result",
      controls: "Keyboard and mouse",
      startState: "At the dock before construction",
      endState: "The arrival result is visible",
      coreClaim: JSON.stringify({
        oneSentencePromise: "Brace a courier craft and learn which structural gamble survives",
        theme: "A fragile courier craft crossing a storm",
        distinctiveSystem: "Player-placed supports redistribute visible stress",
        intendedExperience: "Choose, commit, and read the structural consequence",
        rewardFamily: "discovery",
        intendedReward: "Understand why one choice survived and revise the next build",
        proofMoment: "The reinforced joint survives beside a legible failure",
        amplifier: "Directional deformation and escalating creaks",
      }),
    },
  });
  const coreContent = corePrompt.messages[0]?.content;
  assert(coreContent?.type === "text", "play-build core route did not return text");
  assert(
    coreContent.type === "text"
      && coreContent.text.includes('"coreClaim": {')
      && coreContent.text.includes('"evidenceClass": "declared-design-hypothesis"')
      && coreContent.text.includes('"feltRewardRequiresHumanReport": true')
      && !coreContent.text.includes('"coreClaim": "{'),
    "play-build did not normalize and bound the declared core claim",
  );

  const firstContactRecord = await client.callTool({
    name: "record_first_contact",
    arguments: {
      testedAt: "2026-08-12T11:00:00+04:00",
      assetId: "stdio-viewport-v1",
      assetType: "store-viewport",
      assetDescription: "First visible Steam viewport",
      exposure: {
        device: "desktop",
        viewport: "1440x900",
        durationSeconds: 20,
        sound: "not-applicable",
      },
      recruitment: "External genre players",
      targetPlayerDefinition: "Premium roguelike players",
      participants: [{
        participantId: "p-02",
        targetFit: "high",
        visualQuality: "credible",
        understoodTheme: "yes",
        themeAppeal: "yes",
        understoodAction: "unclear",
        understoodReward: "no",
        tryIntent: "maybe",
        tryIntentReason: "The world appeals to me, but the action and reward are unclear",
        immediateReject: "yes",
        unaidedSummary: "A reactive underworld journey with unclear action",
        rejectionReason: "The action is not visible",
        confusions: ["What I control"],
      }],
    },
  });
  assert(firstContactRecord.isError !== true, "record_first_contact failed");
  const firstContactResultHandle = (
    firstContactRecord.structuredContent?.meta as {resultHandle?: string} | undefined
  )?.resultHandle;
  assert(firstContactResultHandle !== undefined, "record_first_contact returned no result handle");

  const expandedPrompt = await client.getPrompt({
    name: "audit-project",
    arguments: {
      target: "Hades II",
      topic: "Japan launch price",
      subjectKind: "existing-game",
      domains: "competition,price",
      specification: "Evaluate the current launch price without a proposed change.",
      projectBrief: JSON.stringify({
        revisionId: "brief-v1",
        developmentStage: "prelaunch",
        targetPlayer: "Japanese premium roguelike players",
        oneSentencePromise: "A more reactive journey through the underworld",
        runwayMonths: 12,
      }),
      conceptTest: JSON.stringify({
        testedAt: "2026-08-12T10:00:00+04:00",
        stimulusId: "stdio-pitch-v1",
        parentStimulusId: "stdio-pitch-v0",
        changeSummary: "Clarified the repeated action",
        changedVariables: ["presentation"],
        invariantsKept: ["Same audience, questions, and exposure protocol"],
        projectBriefRevision: "brief-v1",
        promiseShown: "A more reactive journey through the underworld",
        stimulusDescription: "A short pitch card",
        exposureProtocol: "Show once, then ask unaided questions",
        recruitment: "External genre players",
        targetPlayerDefinition: "Premium roguelike players",
        questionsAsked: ["What would you do?", "What would feel rewarding?"],
        participants: [{
          participantId: "p-01",
          targetFit: "high",
          understoodTheme: "yes",
          themeSystemFit: "unclear",
          themeSystemFitReason: "The underworld theme is visible, but its connection to the repeated action is unclear",
          understoodAction: "yes",
          understoodReward: "unclear",
          interest: "maybe",
          unaidedSummary: "Take a reactive journey through the underworld",
          confusions: ["The lasting reward was unclear"],
        }],
      }),
      firstContactResultHandle,
      competitors: "Hades, Dead Cells",
      market: "Japan",
      language: "japanese",
      qualityTier: "premium indie",
    },
  });
  assert(expandedPrompt.messages.length === 1, "audit-project must return one prompt message");
  const promptContent = expandedPrompt.messages[0]?.content;
  assert(promptContent?.type === "text", "audit-project must return text content");
  assert(
    promptContent.text.includes("--- END REPOSITORY RECIPE ---")
      && promptContent.text.includes("--- BEGIN INPUT DATA (JSON) ---"),
    "audit-project did not separate its recipe from argument data",
  );
  assert(
    promptContent.text.includes('"target": "Hades II"')
      && promptContent.text.includes('"mode": "baseline"')
      && promptContent.text.includes('"reviewWorkflow": "audit"')
      && promptContent.text.includes('"projectBrief": {')
      && promptContent.text.includes('"projectBriefDiagnostics": {')
      && promptContent.text.includes('"status": "inventory-only"')
      && promptContent.text.includes('"conceptTest": {')
      && promptContent.text.includes('"conceptTestDiagnostics": {')
      && promptContent.text.includes('"revisionStatus": "matched"')
      && promptContent.text.includes('"promiseStatus": "matched"')
      && promptContent.text.includes('"conceptTestEvidence": {')
      && promptContent.text.includes('"exactSaveRequired": true')
      && promptContent.text.includes('"status": "descriptive-only"')
      && promptContent.text.includes('"participantCount": 1')
      && promptContent.text.includes('"unaidedSummaryCount": 1')
      && promptContent.text.includes('"status": "linked-revision"')
      && promptContent.text.includes('"parentStimulusId": "stdio-pitch-v0"')
      && promptContent.text.includes('"firstContactTest": {')
      && promptContent.text.includes('"firstContactTestDiagnostics": {')
      && promptContent.text.includes('"firstContactTestEvidence": {')
      && promptContent.text.includes('"visualQualityCounts": {')
      && promptContent.text.includes('"themeAppealCounts": {')
      && promptContent.text.includes('"tryIntentCounts": {')
      && promptContent.text.includes('"immediateRejectCounts": {')
      && promptContent.text.includes('"developmentStage": "prelaunch"')
      && promptContent.text.includes('"runwayMonths": 12')
      && promptContent.text.includes('"intakeDiagnostics": {\n    "status": "ready"')
      && promptContent.text.includes('"selectedDomains": [\n    "price",\n    "competition"\n  ]'),
    "audit-project did not normalize the supplied arguments",
  );

  const changePrompt = await client.getPrompt({
    name: "review-change",
    arguments: {
      target: "Hades II",
      topic: "Onboarding revision",
      currentState: "Explanation precedes the first action",
      proposal: "The first action teaches the control in context",
    },
  });
  const changeContent = changePrompt.messages[0]?.content;
  assert(
    changeContent?.type === "text"
      && changeContent.text.includes('"mode": "change"')
      && changeContent.text.includes('"reviewWorkflow": "change"'),
    "review-change did not fix the change workflow",
  );

  const playtestPrompt = await client.getPrompt({
    name: "audit-project",
    arguments: {
      target: "Protocol Fixture Game",
      topic: "First-session playtest wiring",
      subjectKind: "existing-game",
      domains: "gameplay,ui",
      playtestUrl: "http://127.0.0.1:4173/play#new-game",
      playtestTask: "Start a new run and reach the tutorial checkpoint",
      playtestBuild: "protocol-fixture-1",
      playtestControls: "keyboard and mouse",
      playtestDurationMinutes: "20",
      playtestSession: JSON.stringify({
        startedAt: "2026-08-12T12:00:00+04:00",
        endedAt: "2026-08-12T12:06:00+04:00",
        sessionId: "stdio-playtest-p03",
        parentSessionId: "stdio-playtest-p02",
        changeSummary: "Made checkpoint reward feedback distinct",
        changedVariables: ["reward"],
        invariantsKept: ["Same task, platform, controls, cohort, and moderation script"],
        buildId: "protocol-fixture-1",
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
        task: "Start a new run and reach the tutorial checkpoint",
        startState: "Fresh save at the title screen",
        endState: "Tutorial checkpoint reached",
        testerType: "human-participant",
        participantId: "p-03",
        targetFit: "medium",
        observationSource: "moderated",
        priorKnowledge: "none",
        observations: [{
          step: 1,
          elapsedSeconds: 18,
          eventType: "reward",
          meaningfulAction: true,
          playerIntent: "Complete the first action",
          inputAction: "Used the prompted keyboard input",
          systemResponse: "Checkpoint progress appeared without a distinct sound cue",
          frictionSeverity: "minor",
          rewardSignal: "unclear",
          evidenceIds: ["stdio-capture-001"],
        }],
        outcome: "completed",
        humanReport: {
          feltReward: "unclear",
          rewardDescription: "The visual progress appeared, but the reward was not distinct",
          wouldRepeat: "maybe",
          confusions: ["Whether the checkpoint granted a reward"],
        },
      }),
      uiBenchmarkTask: "Start a new run from the main menu and reach the tutorial checkpoint",
      market: "United States",
      language: "english",
    },
  });
  const playtestContent = playtestPrompt.messages[0]?.content;
  assert(playtestContent?.type === "text", "audit-project playtest prompt must return text content");
  assert(
    playtestContent.text.includes('"playtestUrl": "http://127.0.0.1:4173/play#new-game"')
      && playtestContent.text.includes('"playtestTask": "Start a new run and reach the tutorial checkpoint"')
      && playtestContent.text.includes('"playtestBuild": "protocol-fixture-1"')
      && playtestContent.text.includes('"playtestControls": "keyboard and mouse"')
      && playtestContent.text.includes('"playtestDurationMinutes": "20"')
      && playtestContent.text.includes('"playtestSession": {')
      && playtestContent.text.includes('"playtestSessionDiagnostics": {')
      && playtestContent.text.includes('"playtestSessionEvidence": {')
      && playtestContent.text.includes('"humanEvidenceStatus": "human-report-present"')
      && playtestContent.text.includes('"rewardSignalCounts": {')
      && playtestContent.text.includes('"parentSessionId": "stdio-playtest-p02"')
      && playtestContent.text.includes('"status": "linked-retest"')
      && playtestContent.text.includes('"causalAttributionStatus": "comparison-candidate-only"')
      && playtestContent.text.includes('"intakeDiagnostics": {\n    "status": "ready"')
      && playtestContent.text.includes('"selectedDomains": [\n    "gameplay",\n    "ui"\n  ]'),
    "audit-project did not round-trip the supplied playtest protocol",
  );

  const cohortPrompt = await client.getPrompt({
    name: "audit-project",
    arguments: {
      target: "Cohort Fixture Game",
      topic: "Bounded playtest cohort wiring",
      subjectKind: "existing-game",
      domains: "gameplay",
      playtestCohort: JSON.stringify(playtestCohortFixture("stdio")),
    },
  });
  const cohortContent = cohortPrompt.messages[0]?.content;
  assert(cohortContent?.type === "text", "audit-project cohort prompt must return text content");
  assert(
    cohortContent.text.includes('"playtestCohort": {')
      && cohortContent.text.includes('"playtestCohortDiagnostics": {')
      && cohortContent.text.includes('"artifactId": "playtest-cohort-stdio-cohort-01"')
      && cohortContent.text.includes('"playtestCohortEvidence": {')
      && cohortContent.text.includes('"observedAt": "2026-08-13T12:04:00+04:00"')
      && cohortContent.text.includes('"evidenceByTesterType": {')
      && cohortContent.text.includes('"ai-operated": {')
      && cohortContent.text.includes('"internalParentCount": 1')
      && cohortContent.text.includes('"comparisonStatus": "comparison-candidate-only"')
      && cohortContent.text.includes('"participantExposure": "ai-operated-pair"')
      && cohortContent.text.includes('"evidenceTransition": {')
      && !cohortContent.text.includes('"completionRate"'),
    "audit-project did not preserve bounded cohort evidence separation",
  );

  const knowledge = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "templates", id: "review-eval.md"},
  });
  assert(knowledge.isError !== true, "get_knowledge returned a tool error");
  assert(
    JSON.stringify(knowledge.structuredContent).includes("Overall Assessment"),
    "get_knowledge did not return the canonical adoption template",
  );
  const uiGapRubric = await client.callTool({
    name: "get_knowledge",
    arguments: {kind: "rubrics", id: "ui-quality-gap.md"},
  });
  assert(uiGapRubric.isError !== true, "get_knowledge returned a UI rubric tool error");
  assert(
    JSON.stringify(uiGapRubric.structuredContent).includes("Game UI Database"),
    "get_knowledge did not return the canonical UI gap rubric",
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
  const runTargets = await client.callTool({
    name: "get_artifact",
    arguments: {kind: "run"},
  });
  assert(runTargets.isError !== true, "get_artifact run listing returned a tool error");
  assert(
    Array.isArray(structuredData(runTargets)),
    "get_artifact did not return a read-only run target list",
  );

  let liveSearch = false;
  let liveBrief = false;
  let liveBriefBytes: number | null = null;
  let liveBriefStatus: unknown = null;
  let liveBriefGapCount: number | null = null;
  let liveBriefCoverage: Array<{dimension?: unknown; status?: unknown}> = [];
  let liveDiscovery = false;
  let liveUpdates = false;
  let livePersonaReadiness = false;
  let liveResultHandles = false;
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
    const searchMeta = search.structuredContent?.meta as Record<string, unknown> | undefined;
    assert(
      typeof searchMeta?.resultHandle === "string",
      "steam_search did not expose an exact-save result handle",
    );
    liveSearch = true;

    const brief = await client.callTool({
      name: "steam_brief",
      arguments: {appid: 1145360, language: "japanese", country: "JP"},
    });
    assert(brief.isError !== true, "steam_brief returned a tool error");
    const briefData = structuredData(brief) as {
      target?: {appid?: unknown; name?: unknown};
      evidence?: {
        reviews?: {positive?: unknown[]; negative?: unknown[]};
        competition?: {candidates?: unknown[]};
      };
      readiness?: {
        status?: unknown;
        unsupportedClaims?: unknown[];
        gaps?: unknown[];
        dimensions?: Array<{dimension?: unknown; status?: unknown}>;
      };
      provenance?: unknown[];
    } | null;
    assert(
      briefData?.target?.appid === 1145360
      && briefData.target.name === "Hades"
      && (briefData.evidence?.reviews?.positive?.length ?? 0) > 0
      && (briefData.evidence?.reviews?.negative?.length ?? 0) > 0
      && (briefData.evidence?.competition?.candidates?.length ?? 0) > 0
      && briefData.readiness?.status !== "blocked"
      && briefData.readiness?.unsupportedClaims?.includes(
        "gameplay quality without direct playtest evidence",
      )
      && briefData.provenance?.length === 6,
      "steam_brief did not return bounded, decision-scoped Hades evidence",
    );
    liveBriefBytes = Buffer.byteLength(JSON.stringify(brief.structuredContent), "utf8");
    assert(
      liveBriefBytes < 50_000,
      "steam_brief exceeded the 50 KiB first-pass budget",
    );
    assert(
      typeof (brief.structuredContent?.meta as Record<string, unknown> | undefined)
        ?.resultHandle === "string",
      "steam_brief did not expose an exact-save result handle",
    );
    liveBriefStatus = briefData.readiness?.status;
    liveBriefGapCount = briefData.readiness?.gaps?.length ?? 0;
    liveBriefCoverage = briefData.readiness?.dimensions ?? [];
    liveBrief = true;

    const discovery = await client.callTool({
      name: "steam_discover",
      arguments: {
        kind: "tag",
        value: "Action Roguelike",
        additionalValues: ["Rogue-lite", "Hack and Slash"],
        excludeAppids: [1145350],
        limit: 10,
      },
    });
    assert(discovery.isError !== true, "steam_discover returned a tool error");
    const discoveryData = structuredData(discovery) as {
      candidates?: Array<{
        appid?: unknown;
        name?: unknown;
        matchedValues?: unknown[];
        sourceRanks?: Record<string, unknown>;
      }>;
    } | null;
    assert(
      discoveryData?.candidates?.some((candidate) =>
        (candidate.appid === 1145360 || candidate.appid === 588650)
        && typeof candidate.name === "string"
        && candidate.name.trim().length > 0
        && candidate.matchedValues?.length === 3
        && Object.keys(candidate.sourceRanks ?? {}).length === 3),
      "steam_discover did not return an intersected Hades or Dead Cells candidate",
    );
    assert(
      discoveryData?.candidates?.every((candidate) => candidate.appid !== 1145350),
      "steam_discover did not exclude the target appid",
    );
    const discoveryMeta = discovery.structuredContent?.meta as
      | Record<string, unknown>
      | undefined;
    assert(
      typeof discoveryMeta?.resultHandle === "string",
      "steam_discover did not expose an exact-save result handle",
    );
    liveDiscovery = true;

    const personas = await client.callTool({
      name: "derive_personas",
      arguments: {
        appids: [1145360],
        count: 5,
        reviewsPerPolarity: 8,
        targetAppid: 1145360,
        market: "Japan",
        language: "japanese",
        researchQuestions: [{
          id: "combat-readability",
          question: "Which combat signals support adoption and continued play?",
          evidenceSignals: ["戦闘", "アクション", "操作", "combat"],
        }],
        sourceRoles: [{
          appid: 1145360,
          role: "target",
          fitRole: "target-game",
          matchedAxes: ["player-problem"],
          researchQuestionIds: ["combat-readability"],
          rationale: "Hades reviews directly describe the target game's combat expectations.",
        }],
      },
    });
    assert(personas.isError !== true, "derive_personas returned a tool error");
    const personasData = structuredData(personas) as {
      reviews?: Array<{recommendationId?: unknown}>;
      generationReadiness?: {
        status?: unknown;
        generationAllowed?: unknown;
        requestedCount?: unknown;
        supportedCount?: unknown;
        availableUniqueReviewCount?: unknown;
        requiredUniqueReviewCount?: unknown;
        minimumUniqueReviewsPerPersona?: unknown;
        voiceReuseAllowed?: unknown;
      };
      instruction?: unknown;
    } | null;
    const uniqueReviewIds = new Set(
      personasData?.reviews?.map(({recommendationId}) => recommendationId) ?? [],
    );
    const supportedPersonaCount = Math.min(5, Math.floor(uniqueReviewIds.size / 3));
    const expectedReadinessStatus = supportedPersonaCount === 0
      ? "blocked"
      : supportedPersonaCount < 5
        ? "partial"
        : "ready";
    assert(
      personasData?.generationReadiness?.status === expectedReadinessStatus
      && personasData.generationReadiness.generationAllowed === (supportedPersonaCount > 0)
      && personasData.generationReadiness.requestedCount === 5
      && personasData.generationReadiness.supportedCount === supportedPersonaCount
      && personasData.generationReadiness.availableUniqueReviewCount === uniqueReviewIds.size
      && personasData.generationReadiness.requiredUniqueReviewCount === 15
      && personasData.generationReadiness.minimumUniqueReviewsPerPersona === 3
      && personasData.generationReadiness.voiceReuseAllowed === false,
      "derive_personas did not return evidence-bounded generation readiness",
    );
    assert(
      typeof (personas.structuredContent?.meta as Record<string, unknown> | undefined)
        ?.resultHandle === "string",
      "derive_personas did not expose an exact-save result handle",
    );
    livePersonaReadiness = true;

    const updates = await client.callTool({
      name: "steam_updates",
      arguments: {appid: 1145360, scope: "updates", limit: 8, contentChars: 600},
    });
    assert(updates.isError !== true, "steam_updates returned a tool error");
    const updatesData = structuredData(updates) as {
      items?: Array<{
        official?: unknown;
        isUpdateLike?: unknown;
        updateEvidence?: unknown;
        updateConfidence?: unknown;
        typeConfidence?: unknown;
        platformHints?: unknown;
      }>;
      summary?: {taggedPatchNotesCount?: unknown; fetchedTaggedPatchNotesCount?: unknown};
    } | null;
    assert(
      (updatesData?.items?.length ?? 0) > 0
      && updatesData?.items?.every((item) =>
        item.official === true
        && item.isUpdateLike === true
        && (item.updateEvidence === "steam-tag" || item.updateEvidence === "title-inference")
        && typeof item.updateConfidence === "number"
        && typeof item.typeConfidence === "number"
        && Array.isArray(item.platformHints))
      && typeof updatesData?.summary?.taggedPatchNotesCount === "number",
      "steam_updates did not return classified official Hades updates",
    );
    assert(
      typeof (updates.structuredContent?.meta as Record<string, unknown> | undefined)
        ?.resultHandle === "string",
      "steam_updates did not expose an exact-save result handle",
    );
    liveUpdates = true;
    liveResultHandles = true;
  }

  assert(protocolErrors.length === 0, `stdio protocol errors: ${protocolErrors.join("; ")}`);
  summary = {
    ok: true,
    tools: tools.length,
    prompts: prompts.length,
    playtestPromptRoundTrip: true,
    playtestCohortRoundTrip: true,
    liveSearch,
    liveBrief,
    liveBriefBytes,
    liveBriefStatus,
    liveBriefGapCount,
    liveBriefCoverage,
    liveDiscovery,
    liveUpdates,
    livePersonaReadiness,
    liveResultHandles,
    runListing: true,
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
