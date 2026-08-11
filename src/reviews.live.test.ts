import {describe, expect, it} from "vitest";
import {fetchReviews} from "./reviews.js";

describe.runIf(process.env.RUN_LIVE === "1")("review fetcher (live API, Hades)", () => {
  it("returns traceable Japanese negative reviews", async () => {
    const result = await fetchReviews(1145360, {
      language: "japanese",
      type: "negative",
      limit: 20,
    });

    expect(result.data?.length).toBeGreaterThan(0);
    expect(result.data?.length).toBeLessThanOrEqual(20);
    for (const review of result.data ?? []) {
      expect(review.votedUp).toBe(false);
      expect(typeof review.playtimeHours).toBe("number");
      expect(review.recommendationId).not.toBe("");
    }
    expect(result.meta?.request).toMatchObject({language: "japanese", type: "negative", limit: 20});
    expect((result.meta?.methodology as {scannedRawCount?: number})?.scannedRawCount)
      .toBeGreaterThanOrEqual(result.data?.length ?? 0);
  }, 30_000);
});
