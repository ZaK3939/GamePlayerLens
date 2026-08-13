import {access, readFile, readdir} from "node:fs/promises";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";

const EXPECTED_TOOLS = [
  "derive_personas",
  "get_artifact",
  "get_knowledge",
  "get_status",
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
const EXPECTED_PROMPTS = ["run-sim", "ui-blind-compare"];
const EXPECTED_RUN_SIM_ARGUMENTS = [
  "target",
  "topic",
  "subjectKind",
  "mode",
  "domains",
  "specification",
  "projectBrief",
  "conceptTest",
  "firstContactTest",
  "playtestSession",
  "playtestCohort",
  "playtestUrl",
  "playtestTask",
  "playtestBuild",
  "playtestControls",
  "playtestDurationMinutes",
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function playtestCohortFixture(prefix: string) {
  const firstSession = {
    startedAt: "2026-08-12T12:00:00+04:00",
    endedAt: "2026-08-12T12:03:00+04:00",
    sessionId: `${prefix}-session-01`,
    buildId: `${prefix}-build-1`,
    platform: "desktop browser",
    controls: "keyboard and mouse",
    task: "Reach the tutorial checkpoint",
    startState: "Fresh save at title",
    endState: "Tutorial checkpoint reached",
    testerType: "ai-operated",
    observationSource: "direct-session",
    priorKnowledge: "none",
    observations: [{
      step: 1,
      elapsedSeconds: 10,
      eventType: "action",
      meaningfulAction: true,
      playerIntent: "Advance toward the checkpoint",
      inputAction: "Used the prompted movement input",
      systemResponse: "The avatar moved toward the checkpoint",
      frictionSeverity: "none",
      rewardSignal: "not-assessed",
    }],
    outcome: "completed",
  };
  return {
    assembledAt: "2026-08-13T13:00:00+04:00",
    cohortId: `${prefix}-cohort-01`,
    purpose: "Verify bounded cohort prompt wiring",
    recruitment: "AI-operated transport fixture",
    targetPlayerDefinition: "Not applicable to this transport fixture",
    samplingBoundary: "Two synthetic sessions for MCP wiring only",
    sessions: [
      firstSession,
      {
        ...firstSession,
        startedAt: "2026-08-13T12:00:00+04:00",
        endedAt: "2026-08-13T12:04:00+04:00",
        sessionId: `${prefix}-session-02`,
        parentSessionId: `${prefix}-session-01`,
        changeSummary: "Made checkpoint completion feedback distinct",
        changedVariables: ["reward"],
        invariantsKept: [
          "Same task, platform, controls, start state, and operator protocol",
        ],
        buildId: `${prefix}-build-2`,
        observations: [{
          ...firstSession.observations[0],
          eventType: "reward",
          systemResponse: "The checkpoint emitted a distinct flash and sound",
          rewardSignal: "demonstrated",
        }],
      },
    ],
  };
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

  const status = await client.callTool({name: "get_status", arguments: {}});
  const statusJson = JSON.stringify(status.structuredContent);
  assert(status.isError !== true, "get_status returned a tool error");
  assert(
    statusJson.includes('"location":"repository-root"')
      && statusJson.includes('"toolCount":14')
      && !statusJson.includes(repositoryRoot),
    "get_status did not return safe repository readiness metadata",
  );

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
      subjectKind: "existing-game",
      mode: "baseline",
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
          understoodAction: "yes",
          understoodReward: "unclear",
          interest: "maybe",
          unaidedSummary: "Take a reactive journey through the underworld",
          confusions: ["The lasting reward was unclear"],
        }],
      }),
      firstContactTest: JSON.stringify({
        testedAt: "2026-08-12T11:00:00+04:00",
        assetId: "stdio-viewport-v1",
        assetType: "store-viewport",
        assetDescription: "First visible Steam viewport",
        exposureContext: {
          device: "desktop",
          viewport: "1440x900",
          durationSeconds: 20,
          sound: "not-applicable",
          orderDescription: "Natural store order without scrolling",
        },
        recruitment: "External genre players",
        targetPlayerDefinition: "Premium roguelike players",
        questionsAsked: ["What would you do?", "Would you leave immediately?"],
        participants: [{
          participantId: "p-02",
          targetFit: "high",
          visualQuality: "credible",
          understoodTheme: "yes",
          understoodAction: "unclear",
          understoodReward: "no",
          immediateReject: "yes",
          unaidedSummary: "A reactive underworld journey with unclear action",
          rejectionReason: "The action is not visible",
          confusions: ["What I control"],
        }],
      }),
      competitors: "Hades, Dead Cells",
      market: "Japan",
      language: "japanese",
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
      && promptContent.text.includes('"immediateRejectCounts": {')
      && promptContent.text.includes('"developmentStage": "prelaunch"')
      && promptContent.text.includes('"runwayMonths": 12')
      && promptContent.text.includes('"intakeDiagnostics": {\n    "status": "ready"')
      && promptContent.text.includes('"selectedDomains": [\n    "price",\n    "competition"\n  ]'),
    "run-sim did not normalize the supplied arguments",
  );

  const playtestPrompt = await client.getPrompt({
    name: "run-sim",
    arguments: {
      target: "Protocol Fixture Game",
      topic: "First-session playtest wiring",
      subjectKind: "existing-game",
      mode: "baseline",
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
        platform: "desktop browser",
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
  assert(playtestContent?.type === "text", "run-sim playtest prompt must return text content");
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
    "run-sim did not round-trip the supplied playtest protocol",
  );

  const cohortPrompt = await client.getPrompt({
    name: "run-sim",
    arguments: {
      target: "Cohort Fixture Game",
      topic: "Bounded playtest cohort wiring",
      subjectKind: "existing-game",
      mode: "baseline",
      domains: "gameplay",
      playtestCohort: JSON.stringify(playtestCohortFixture("stdio")),
    },
  });
  const cohortContent = cohortPrompt.messages[0]?.content;
  assert(cohortContent?.type === "text", "run-sim cohort prompt must return text content");
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
    "run-sim did not preserve bounded cohort evidence separation",
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
        sourceRoles: [{appid: 1145360, role: "target"}],
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
