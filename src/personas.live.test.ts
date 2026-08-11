import {describe, expect, it} from "vitest";
import {buildDerivationPack} from "./personas.js";

describe.runIf(process.env.RUN_LIVE === "1")("persona derivation (live API, Hades)", () => {
  it("builds a deduplicated evidence pack", async () => {
    const result = await buildDerivationPack([1145360], 5, 8, {
      targetAppid: 1145360,
      market: "Japan",
      language: "japanese",
      focus: ["adoption", "retention", "churn", "update-response"],
      sourceRoles: [{appid: 1145360, role: "target"}],
    });
    expect(result.data?.requestedCount).toBe(5);
    expect(result.data?.reviews.length).toBeGreaterThanOrEqual(10);
    expect(result.data?.reviews.length).toBeLessThanOrEqual(16);
    const ids = result.data?.reviews.map((review) => review.recommendationId) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.data?.instruction).toContain("save_persona");
    expect(result.data?.brief).toMatchObject({
      targetAppid: 1145360,
      market: "Japan",
      language: "japanese",
      sources: [{appid: 1145360, role: "target"}],
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
