import {describe, expect, it} from "vitest";
import {buildDerivationPack} from "./personas.js";

describe.runIf(process.env.RUN_LIVE === "1")("persona derivation (live API, Hades)", () => {
  it("builds a deduplicated evidence pack", async () => {
    const result = await buildDerivationPack([1145360], {
      targetAppid: 1145360,
      market: "Japan",
      language: "japanese",
      focus: ["adoption", "retention", "churn", "update-response"],
      researchQuestions: [{
        id: "combat-readability",
        question: "Which combat signals support adoption and continued play?",
      }],
      sourceRoles: [{
        appid: 1145360,
        role: "target",
        fitRole: "target-game",
        matchedAxes: ["player-problem"],
        researchQuestionIds: ["combat-readability"],
        rationale: "Hades reviews directly describe the target game's combat expectations.",
      }],
    }, 5, 8);
    expect(result.data?.requestedCount).toBe(5);
    expect(result.data?.reviews.length).toBeGreaterThanOrEqual(10);
    expect(result.data?.reviews.length).toBeLessThanOrEqual(16);
    const ids = result.data?.reviews.map((review) => review.recommendationId) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    const supportedCount = Math.min(5, Math.floor(ids.length / 3));
    expect(result.data?.generationReadiness).toEqual({
      status: supportedCount === 0 ? "blocked" : supportedCount < 5 ? "partial" : "ready",
      generationAllowed: supportedCount > 0,
      requestedCount: 5,
      supportedCount,
      availableUniqueReviewCount: ids.length,
      requiredUniqueReviewCount: 15,
      minimumUniqueReviewsPerPersona: 3,
      voiceReuseAllowed: false,
    });
    expect(result.data?.instruction).toContain("save_persona");
    expect(result.data?.brief).toMatchObject({
      targetAppid: 1145360,
      market: "Japan",
      language: "japanese",
      researchQuestions: [{
        id: "combat-readability",
        question: "Which combat signals support adoption and continued play?",
      }],
      sources: [{
        appid: 1145360,
        role: "target",
        fitRole: "target-game",
      }],
    });
    expect((result.data?.schema.required as unknown[] | undefined)).toEqual(
      expect.arrayContaining(["schema_version", "target_context", "decision_profile", "evidence_basis"]),
    );
    expect(result.meta?.methodology).toMatchObject({
      strategy: "requested-language-first-recent-polarity-balanced",
      ordering: "round-robin-appid-polarity",
      representative: false,
      requestedPerPolarity: 8,
    });
  }, 45_000);
});
