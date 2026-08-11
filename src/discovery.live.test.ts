import {describe, expect, it} from "vitest";
import {discoverGames} from "./discovery.js";

describe.runIf(process.env.RUN_LIVE === "1")(
  "discovery (live SteamSpy API, Action Roguelike tag)",
  () => {
    it("returns at least one candidate with a valid appid and name", async () => {
      const result = await discoverGames({
        kind: "tag",
        value: "Action Roguelike",
      });

      expect(result.data).not.toBeNull();
      expect(result.data?.candidates.some((candidate) =>
        Number.isSafeInteger(candidate.appid)
        && candidate.appid > 0
        && candidate.name.trim().length > 0
      )).toBe(true);
    }, 30_000);
  },
);
