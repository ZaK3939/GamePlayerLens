import {describe, expect, it} from "vitest";
import {fetchUpdates} from "./updates.js";

describe.runIf(process.env.RUN_LIVE === "1")("Steam updates (live API, Hades)", () => {
  it("finds traceable official update history", async () => {
    const result = await fetchUpdates(1145360, {
      scope: "updates",
      limit: 20,
      contentChars: 600,
    });

    expect(result.data?.appid).toBe(1145360);
    expect(result.data?.items.length).toBeGreaterThan(0);
    expect(result.data?.items.every((item) =>
      item.official
      && item.isUpdateLike
      && ["steam-tag", "title-inference"].includes(item.updateEvidence)
      && item.updateConfidence > 0
      && item.gid.length > 0
      && item.publishedAt.endsWith("Z"))).toBe(true);
    expect(result.data?.summary.taggedPatchNotesCount).toBeGreaterThan(0);
    expect(result.data?.summary.fetchedTaggedPatchNotesCount)
      .toBeGreaterThanOrEqual(result.data?.summary.taggedPatchNotesCount ?? 0);
    expect(result.data?.items.some((item) => [
      "Hades II: Coming to Steam Early Access!",
      "Hades: Nominated for Game of the Year!",
    ].includes(item.title))).toBe(false);
    expect(result.meta?.sources?.some((source) => source.name === "Steam News")).toBe(true);
  }, 45_000);
});
