import {describe, expect, it} from "vitest";
import type {Persona} from "./persona-schemas.js";
import {
  buildPlayerPanelRecord,
  PlayerPanelInputSchema,
  validatePlayerPanelDraft,
} from "./player-panel.js";

const NOW = "2026-08-17T10:00:00.000Z";

function persona(): Persona {
  return {
    id: "cautious-builder",
    source_appids: [123],
    archetype: "Cautious structural planner",
    playtime_profile: "Players who inspect failure causes before rebuilding",
    priorities: ["readable structural causality"],
    voice: [1, 2, 3].map((index) => ({
      text: `review voice ${index}`,
      source_appid: 123,
      recommendation_id: `rec-${index}`,
      language: "english",
      voted_up: index !== 3,
    })),
    dealbreakers: ["failures without a readable cause"],
    price_sensitivity: "medium",
    schema_version: 3,
    target_context: {
      market: "Global",
      language: "english",
      research_questions: [{
        id: "failure-causality",
        question: "Can the player identify which construction choice caused failure?",
        evidenceSignals: ["support", "failure"],
      }],
      source_roles: [{
        appid: 123,
        role: "competitor",
        fitRole: "direct-competitor",
        matchedAxes: ["repeated-action", "system-response", "player-problem"],
        researchQuestionIds: ["failure-causality"],
        rationale: "The game exposes the same build, stress, and failure decision loop.",
      }],
    },
    decision_profile: {
      adoption_trigger: "Construction consequences are readable",
      retention_trigger: "Each failure suggests a better next build",
      churn_trigger: "The structure fails without a legible cause",
      update_reaction: "Retry after causality feedback changes",
    },
    evidence_basis: {
      observed_patterns: [{
        research_question_id: "failure-causality",
        claim: "Readable failure causality supports another attempt",
        evidence: [1, 2, 3].map((index) => ({
          source_appid: 123,
          recommendation_id: `rec-${index}`,
          relevance: "The review connects support placement to the visible failure result.",
        })),
      }, {
        research_question_id: "failure-causality",
        claim: "Unclear structural feedback interrupts learning",
        evidence: [{
          source_appid: 123,
          recommendation_id: "rec-3",
          relevance: "The review describes an unreadable failure cause.",
        }],
      }],
      inferred_traits: [],
      limitations: ["This persona does not represent population share."],
      overall_confidence: "medium",
    },
    grounding: {
      sourceTool: "derive_personas",
      observedAt: "2026-08-16T10:00:00.000Z",
      resultSha256: "a".repeat(64),
    },
  };
}

function input() {
  return {
    target: "Project Harbor",
    observedAt: NOW,
    buildId: "build-042",
    task: "Build one vessel and complete one delivery",
    startState: "At the empty dock",
    endState: "The delivery result and structural failure are visible",
    outcome: "completed" as const,
    stimulus: [{
      sequence: 1,
      intent: "Reinforce the cargo branch",
      input: "Placed one support and launched",
      observedSystemResponse: "The unsupported branch failed first at arrival",
      friction: "The stress display did not identify the failing joint",
      evidenceRefs: ["capture-arrival", "receipt-042"],
    }],
    neutral: {
      summary: "The task completes, but the exact structural cause is hard to read.",
      nextChoice: "Add a support near the failed branch and repeat the route.",
      uncertainties: ["Human players may read the stress display differently."],
    },
    coreClarity: {
      distinctiveness: {
        status: "visible" as const,
        finding: "Support placement changes the structural failure result.",
        evidenceRefs: ["receipt-042"],
      },
      communication: {
        status: "partial" as const,
        finding: "The result changes, but the responsible joint is not identified.",
        evidenceRefs: ["capture-arrival", "receipt-042"],
      },
      sceneLegibility: {
        status: "partial" as const,
        finding: "The failure is visible while the stress hierarchy remains ambiguous.",
        evidenceRefs: ["capture-arrival"],
      },
    },
    lenses: [{
      personaId: "cautious-builder",
      researchQuestionId: "failure-causality",
      voiceEvidence: [{sourceAppid: 123, recommendationId: "rec-1"}],
      predictedResponse: "The player is likely to retry only if the failed joint is identifiable.",
      nextChoice: "Inspect the joint and add one support before relaunching.",
      confidence: "medium" as const,
      humanFalsifier: "Without explanation, ask which construction choice caused the failure.",
    }],
  };
}

describe("player panel records", () => {
  it("binds every lens to one shared stimulus and exact saved persona memory", async () => {
    const saved = persona();
    const record = await buildPlayerPanelRecord(input(), async (id) => {
      if (id !== saved.id) throw new Error("persona not found");
      return saved;
    });

    expect(record).toMatchObject({
      schemaVersion: 1,
      artifactType: "player-panel",
      target: "Project Harbor",
      observedAt: NOW,
      buildId: "build-042",
      stimulus: input().stimulus,
      neutral: input().neutral,
      coreClarity: input().coreClarity,
      lenses: [{
        personaId: "cautious-builder",
        personaSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        researchQuestion: {
          id: "failure-causality",
          question: expect.stringContaining("construction choice"),
        },
        groundedMemory: [{
          sourceAppid: 123,
          recommendationId: "rec-1",
          text: "review voice 1",
          votedUp: true,
        }],
      }],
    });
    expect(record.limitations).toContain(
      "Predicted responses are hypotheses, not reports from people who played the target build.",
    );
  });

  it("rejects duplicate persona lenses before reading storage", () => {
    const duplicated = {...input(), lenses: [input().lenses[0]!, input().lenses[0]!]} as const;
    expect(PlayerPanelInputSchema.safeParse(duplicated).success).toBe(false);
  });

  it("rejects an unknown saved persona", async () => {
    await expect(buildPlayerPanelRecord(input(), async () => {
      throw new Error("ENOENT");
    })).rejects.toThrow(/saved persona.*cautious-builder.*could not be loaded/i);
  });

  it("rejects voice evidence absent from the saved persona", async () => {
    const invalid = input();
    invalid.lenses[0]!.voiceEvidence = [{sourceAppid: 123, recommendationId: "invented"}];

    await expect(buildPlayerPanelRecord(invalid, async () => persona()))
      .rejects.toThrow(/voice evidence.*invented.*not present/i);
  });

  it("rejects a citation that does not ground the selected research question", async () => {
    const saved = persona();
    saved.evidence_basis.observed_patterns = saved.evidence_basis.observed_patterns.map(
      (pattern) => ({...pattern, evidence: pattern.evidence.filter(
        ({recommendation_id}) => recommendation_id !== "rec-1",
      )}),
    );

    await expect(buildPlayerPanelRecord(input(), async () => saved))
      .rejects.toThrow(/does not ground research question.*failure-causality/i);
  });

  it("returns actionable missing fields for an incomplete panel without throwing", async () => {
    const validation = await validatePlayerPanelDraft({}, async () => persona());

    expect(validation.ready).toBe(false);
    expect(validation.missingTopLevelFields).toEqual([
      "target",
      "observedAt",
      "buildId",
      "task",
      "startState",
      "endState",
      "outcome",
      "stimulus",
      "neutral",
      "coreClarity",
      "lenses",
    ]);
    expect(validation.issues).toContainEqual(expect.objectContaining({
      path: "target",
      stage: "schema",
    }));
  });

  it("checks saved persona grounding in dry-run mode without saving a result", async () => {
    await expect(validatePlayerPanelDraft(input(), async () => persona())).resolves.toMatchObject({
      ready: true,
      missingTopLevelFields: [],
      issues: [],
      nextAction: "Call record_player_panel with the same input.",
    });

    await expect(validatePlayerPanelDraft(input(), async () => {
      throw new Error("persona unavailable");
    })).resolves.toMatchObject({
      ready: false,
      missingTopLevelFields: [],
      issues: [{stage: "grounding", path: "lenses", message: expect.stringContaining("could not be loaded")}],
    });
  });
});
