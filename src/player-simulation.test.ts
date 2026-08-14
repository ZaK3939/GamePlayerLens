import {describe, expect, it} from "vitest";
import {canonicalSha256} from "./integrity.js";
import type {Persona} from "./persona-schemas.js";
import {assertPlayerSimulationGrounding} from "./player-simulation.js";
import type {
  ResolvedEvidenceResult,
  ResolvedPersonaResult,
} from "./run-evidence.js";
import type {SaveRunInput} from "./run-schemas.js";

const SHA = "a".repeat(64);
const OBSERVED_AT = "2026-08-14T09:00:00+04:00";

function derivationPayload(includeCompetitor: boolean) {
  const reviews = [
    {
      sourceAppid: 10,
      sourceRole: "target",
      recommendationId: "target-1",
      review: "The target is interesting when choices are readable.",
      language: "english",
      votedUp: true,
    },
    {
      sourceAppid: 10,
      sourceRole: "target",
      recommendationId: "target-2",
      review: "Unclear feedback makes me stop.",
      language: "english",
      votedUp: false,
    },
    includeCompetitor
      ? {
          sourceAppid: 20,
          sourceRole: "competitor",
          recommendationId: "competitor-voice",
          review: "A comparable game made the decision readable.",
          language: "english",
          votedUp: true,
        }
      : {
          sourceAppid: 10,
          sourceRole: "target",
          recommendationId: "target-3",
          review: "Readable outcomes keep me engaged.",
          language: "english",
          votedUp: true,
        },
  ];
  return {
    data: {
      generationReadiness: {generationAllowed: true, supportedCount: 1},
      brief: {
        market: "United States",
        language: "english",
        sources: [
          {appid: 10, role: "target"},
          ...(includeCompetitor ? [{appid: 20, role: "competitor"}] : []),
        ],
      },
      reviews,
    },
    warnings: [],
    meta: {observedAt: OBSERVED_AT},
  };
}

function persona(includeCompetitor: boolean): Persona {
  const competitorVoice = {
    text: "A comparable game made the decision readable.",
    source_appid: 20,
    recommendation_id: "competitor-voice",
    language: "english",
    voted_up: true,
  };
  return {
    id: "grounded-player",
    source_appids: includeCompetitor ? [10, 20] : [10],
    archetype: "Readability-focused strategy player",
    playtime_profile: "Weekly strategy player",
    priorities: ["clear decisions"],
    voice: [
      {
        text: "The target is interesting when choices are readable.",
        source_appid: 10,
        recommendation_id: "target-1",
        language: "english",
        voted_up: true,
      },
      {
        text: "Unclear feedback makes me stop.",
        source_appid: 10,
        recommendation_id: "target-2",
        language: "english",
        voted_up: false,
      },
      includeCompetitor
        ? competitorVoice
        : {
            text: "Readable outcomes keep me engaged.",
            source_appid: 10,
            recommendation_id: "target-3",
            language: "english",
            voted_up: true,
          },
    ],
    dealbreakers: ["unclear feedback"],
    price_sensitivity: "medium",
    schema_version: 2,
    target_context: {
      market: "United States",
      language: "english",
      source_roles: [
        {appid: 10, role: "target"},
        ...(includeCompetitor ? [{appid: 20, role: "competitor" as const}] : []),
      ],
    },
    decision_profile: {
      adoption_trigger: "The first decision is readable",
      retention_trigger: "Decisions continue to produce distinct outcomes",
      churn_trigger: "Feedback becomes unclear",
      update_reaction: "Reassess after a direct comparison",
    },
    evidence_basis: {
      observed_patterns: [
        {
          claim: "Readable decisions support adoption",
          evidence: [{source_appid: 10, recommendation_id: "target-1"}],
        },
        {
          claim: "Unclear feedback causes churn",
          evidence: [{source_appid: 10, recommendation_id: "target-2"}],
        },
      ],
      inferred_traits: [],
      limitations: ["This persona does not establish population share"],
      overall_confidence: "medium",
    },
    grounding: {
      sourceTool: "derive_personas",
      observedAt: OBSERVED_AT,
      resultSha256: canonicalSha256(derivationPayload(includeCompetitor)),
    },
  };
}

function resolvedPersona(includeCompetitor: boolean): ResolvedPersonaResult {
  return {
    record: {id: "grounded-player", path: "knowledge/personas/grounded-player.json", sha256: SHA},
    persona: persona(includeCompetitor),
  };
}

function simulation(sourceAppid: number, recommendationId: string) {
  return {
    exposure: "visual-evidence" as const,
    stimulusEvidenceRefs: ["stimulus"],
    memory: {
      derivationEvidenceRef: "derivation",
      voiceEvidence: [{sourceAppid, recommendationId}],
    },
    perception: {
      expectation: "The main choice should be readable.",
      noticedSignals: ["The target state is visible."],
      unclearSignals: [],
    },
    decision: {action: "Inspect the next choice.", reason: "Clarity drives adoption."},
    response: {
      predictedFeeling: {
        before: "Cautious about an unclear choice.",
        after: "Interested after the outcome becomes readable.",
      },
      frictions: [],
      rewardSignals: ["The outcome is visible."],
      continuation: "continue" as const,
      continuationReason: "The next choice is understandable.",
    },
    reflection: {
      confidence: "medium" as const,
      uncertainties: ["Human response is unobserved."],
      humanValidationQuestion: "What would you do next?",
      observableSignal: "The participant identifies the intended choice.",
    },
  };
}

function input(
  domains: SaveRunInput["selectedDomains"],
  sourceAppid: number,
  recommendationId: string,
): SaveRunInput {
  return {
    selectedDomains: domains,
    rounds: [{
      sequence: 1,
      phase: "persona",
      actor: "grounded-player",
      personaId: "grounded-player",
      scenarioId: "current",
      playerSimulation: simulation(sourceAppid, recommendationId),
      output: "Structured player response.",
      evidenceRefs: ["derivation", "stimulus"],
    }],
  } as SaveRunInput;
}

function derivationEvidence(includeCompetitor: boolean): ResolvedEvidenceResult {
  return {
    record: {
      ref: "derivation",
      kind: "intel",
      targetId: "game",
      id: "persona-derivation",
      path: "knowledge/intel/game/persona-derivation.json",
      sha256: SHA,
      sourceTool: "derive_personas",
      observedAt: OBSERVED_AT,
    },
    payload: derivationPayload(includeCompetitor),
  };
}

const visualStimulus: ResolvedEvidenceResult = {
  record: {
    ref: "stimulus",
    kind: "capture",
    id: "current-ui",
    path: "knowledge/intel/captures/current-ui.png",
    sha256: SHA,
  },
};

describe("player simulation grounding", () => {
  it("rejects derivation evidence that no longer matches the saved persona hash", () => {
    const evidence = derivationEvidence(false);
    evidence.payload = {
      ...(evidence.payload as Record<string, unknown>),
      warnings: ["tampered after persona save"],
    };

    expect(() => assertPlayerSimulationGrounding(
      input(["gameplay"], 10, "target-1"),
      [resolvedPersona(false)],
      [evidence, visualStimulus],
    )).toThrow(/derivation evidence hash mismatch/i);
  });

  it("rejects review voice reuse across different personas", () => {
    const first = resolvedPersona(false);
    const second: ResolvedPersonaResult = {
      record: {
        ...first.record,
        id: "second-player",
        path: "knowledge/personas/second-player.json",
      },
      persona: {...first.persona, id: "second-player"},
    };

    expect(() => assertPlayerSimulationGrounding(
      input(["gameplay"], 10, "target-1"),
      [first, second],
      [derivationEvidence(false), visualStimulus],
    )).toThrow(/review voice is reused across personas/i);
  });

  it("requires cited visual evidence when UI is selected", () => {
    const run = input(["ui"], 10, "target-1");

    const nonVisualStimulus: ResolvedEvidenceResult = {
      record: {
        ref: "stimulus",
        kind: "intel",
        targetId: "game",
        id: "scenario-copy",
        path: "knowledge/intel/game/scenario-copy.json",
        sha256: SHA,
        sourceTool: "manual",
      },
      payload: {copy: "scenario"},
    };
    expect(() => assertPlayerSimulationGrounding(
      run,
      [resolvedPersona(false)],
      [derivationEvidence(false), nonVisualStimulus],
    )).toThrow(/requires explicit visual stimulus/i);
    expect(() => assertPlayerSimulationGrounding(
      run,
      [resolvedPersona(false)],
      [derivationEvidence(false), visualStimulus],
    )).not.toThrow();
  });

  it("requires a competitor review voice when competition is selected", () => {
    expect(() => assertPlayerSimulationGrounding(
      input(["competition"], 10, "target-1"),
      [resolvedPersona(true)],
      [derivationEvidence(true), visualStimulus],
    )).toThrow(/requires competitor review voice evidence/i);

    expect(() => assertPlayerSimulationGrounding(
      input(["competition"], 20, "competitor-voice"),
      [resolvedPersona(true)],
      [derivationEvidence(true), visualStimulus],
    )).not.toThrow();
  });

  it("requires a recorded AI-operated session for AI-operated exposure", () => {
    const run = input(["gameplay"], 10, "target-1");
    run.rounds[0]!.playerSimulation!.exposure = "ai-operated";
    const aiSessionEvidence: ResolvedEvidenceResult = {
      record: {
        ref: "stimulus",
        kind: "intel",
        targetId: "game",
        id: "playtest-session-ai-01",
        path: "knowledge/intel/game/playtest-session-ai-01.json",
        sha256: SHA,
        sourceTool: "manual",
      },
      payload: {
        data: {
          startedAt: "2026-08-14T10:00:00+04:00",
          endedAt: "2026-08-14T10:01:00+04:00",
          sessionId: "ai-01",
          buildId: "fixture-build",
          executionEnvironment: {
            operatingSystem: "Windows 11",
            device: "Desktop",
            runtime: "Chromium",
            rendererBackend: "webgl2",
            rendererImplementation: "ANGLE D3D11",
            graphicsAcceleration: "hardware",
            viewport: {width: 1920, height: 1080, devicePixelRatio: 1},
          },
          controls: "keyboard",
          task: "Reach the first combat result",
          startState: "Title screen",
          endState: "First combat result",
          testerType: "ai-operated",
          observationSource: "direct-session",
          priorKnowledge: "specification",
          observations: [{
            step: 1,
            elapsedSeconds: 1,
            eventType: "action",
            meaningfulAction: true,
            playerIntent: "Start the game",
            inputAction: "press enter",
            systemResponse: "Loading screen appeared",
            frictionSeverity: "none",
            rewardSignal: "not-assessed",
          }],
          outcome: "completed",
        },
      },
    };

    expect(() => assertPlayerSimulationGrounding(
      run,
      [resolvedPersona(false)],
      [derivationEvidence(false), visualStimulus],
    )).toThrow(/requires an explicit AI-operated session stimulus/i);
    expect(() => assertPlayerSimulationGrounding(
      run,
      [resolvedPersona(false)],
      [derivationEvidence(false), aiSessionEvidence],
    )).not.toThrow();
  });

});
