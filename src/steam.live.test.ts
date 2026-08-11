import {describe, expect, it} from "vitest";
import {fetchGame, searchGames} from "./steam.js";

describe.runIf(process.env.RUN_LIVE === "1")(
  "steam data layer (live API, Hades)",
  () => {
    it("finds Hades", async () => {
      const result = await searchGames("Hades");
      expect(result.data?.some((hit) => hit.appid === 1145360)).toBe(true);
      expect(result.meta?.request).toEqual({query: "Hades"});
      expect(result.meta?.sources?.some((source) => source.name === "Steam Store")).toBe(true);
    });

    it("returns a normalized game profile", async () => {
      const result = await fetchGame(1145360);
      expect(result.data?.name).toBe("Hades");
      expect(result.data?.languages).toContain("Japanese");
      expect(result.data?.prices.jp?.currency).toBe("JPY");
      expect(result.data?.tags.length).toBeGreaterThan(3);
      expect(result.meta?.request).toEqual({countries: ["US", "JP", "DE"]});
      expect(result.meta?.sources?.some((source) => source.name === "SteamSpy")).toBe(true);
    }, 30_000);
  },
);
