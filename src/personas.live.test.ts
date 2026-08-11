import {describe, expect, it} from "vitest";
import {buildDerivationPack} from "./personas.js";

describe.runIf(process.env.RUN_LIVE === "1")("persona derivation (live API, Hades)", () => {
  it("builds a deduplicated evidence pack", async () => {
    const result = await buildDerivationPack([1145360]);
    expect(result.data?.requestedCount).toBe(5);
    expect(result.data?.reviews.length).toBeGreaterThanOrEqual(10);
    const ids = result.data?.reviews.map((review) => review.recommendationId) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.data?.instruction).toContain("save_persona");
    expect(result.meta?.methodology).toMatchObject({
      strategy: "recent-polarity-balanced",
      representative: false,
      requestedPerPolarity: 25,
    });
  }, 45_000);
});
