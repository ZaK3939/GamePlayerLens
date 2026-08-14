export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function playtestCohortFixture(prefix: string) {
  const firstSession = {
    startedAt: "2026-08-12T12:00:00+04:00",
    endedAt: "2026-08-12T12:03:00+04:00",
    sessionId: `${prefix}-session-01`,
    buildId: `${prefix}-build-1`,
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

export function stringEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"),
  );
}
