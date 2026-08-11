import {describe, expect, it} from "vitest";
import {fetchTimeline} from "./timeline.js";

describe.runIf(process.env.RUN_LIVE === "1")("timeline (live API, Hades)", () => {
  it("returns current SteamSpy data and explicit ITAD availability", async () => {
    const result = await fetchTimeline(1145360);
    expect(typeof result.data?.currentCcu).toBe("number");
    expect(result.data?.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.meta?.observedAt).toBe(result.data?.observedAt);
    expect(result.meta?.request).toMatchObject({country: "US"});
    expect(result.meta?.sources?.map((source) => source.name))
      .toEqual(["SteamSpy", "IsThereAnyDeal"]);

    if ((process.env.ITAD_API_KEY ?? "").trim()) {
      expect(Array.isArray(result.data?.priceHistory)).toBe(true);
      for (const point of result.data?.priceHistory ?? []) {
        expect(point.currency).not.toBe("");
      }
    } else {
      expect(result.data?.priceHistory).toBeNull();
      expect(result.warnings.join(" ")).toContain("ITAD_API_KEY");
    }
  }, 30_000);
});
