import {describe, expect, it} from "vitest";
import {discoverGames} from "./discovery.js";

describe.runIf(process.env.RUN_LIVE === "1")(
  "discovery (live SteamSpy API, intersected action roguelike tags)",
  () => {
    it("finds a close competitor while excluding the target appid", async () => {
      const result = await discoverGames({
        kind: "tag",
        value: "Action Roguelike",
        additionalValues: ["Rogue-lite", "Hack and Slash"],
        excludeAppids: [1145350],
        limit: 10,
      });

      expect(result.data).not.toBeNull();
      expect(result.data?.candidates.some((candidate) =>
        candidate.appid === 1145360 || candidate.appid === 588650
      )).toBe(true);
      expect(result.data?.candidates.every((candidate) =>
        candidate.appid !== 1145350
        && candidate.matchedValues?.length === 3
        && Object.keys(candidate.sourceRanks ?? {}).length === 3
      )).toBe(true);
    }, 30_000);
  },
);
