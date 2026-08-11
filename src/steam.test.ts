import {describe, expect, it, vi} from "vitest";
import {
  createGameFetcher,
  createSearchGamesFetcher,
  normalizeGameProfile,
  parseSupportedLanguages,
} from "./steam.js";

const appid = 1145360;
const NOW = new Date("2026-08-11T12:34:56.000Z");

function storeData(overrides: Record<string, unknown> = {}) {
  return {
    name: "Hades",
    steam_appid: appid,
    is_free: false,
    short_description: "Defy the god of the dead.",
    about_the_game: "<h2>Escape the Underworld</h2><p>Fight. Die. Repeat.</p>",
    supported_languages: "English<strong>*</strong>, Japanese, French*",
    price_overview: {
      currency: "USD",
      final_formatted: "$24.99",
      discount_percent: 0,
    },
    release_date: {date: "Sep 17, 2020"},
    genres: [{description: "Action"}, {description: "RPG"}],
    categories: [
      {description: "Single-player"},
      {description: "Full controller support"},
      {description: "Single-player"},
    ],
    screenshots: [{path_full: "https://cdn.example/1.jpg"}],
    ...overrides,
  };
}

function storeResult(data: ReturnType<typeof storeData> | null, warnings: string[] = []) {
  return {
    data: data === null ? null : {[appid]: {success: true, data}},
    warnings,
  };
}

const spy = {
  appid,
  name: "Hades",
  owners: "5,000,000 .. 10,000,000",
  ccu: 12345,
  positive: 95,
  negative: 5,
  tags: {Roguelike: 1000, Action: 900},
};

describe("parseSupportedLanguages", () => {
  it("strips tags and footnote markers", () => {
    expect(parseSupportedLanguages("English<strong>*</strong>, Japanese, French*"))
      .toEqual(["English", "Japanese", "French"]);
  });

  it("drops Steam's trailing full-audio footnote", () => {
    expect(parseSupportedLanguages(
      "English<strong>*</strong>, French, Japanese<br><strong>*</strong>languages with full audio support",
    )).toEqual(["English", "French", "Japanese"]);
  });
});

describe("normalizeGameProfile", () => {
  it("normalizes store regions and SteamSpy", () => {
    const result = normalizeGameProfile(
      appid,
      {
        us: storeResult(storeData()),
        jp: storeResult(storeData({
          short_description: "冥界の神に抗え。",
          about_the_game: "<p>戦い、死に、また挑め。</p>",
          price_overview: {
            currency: "JPY",
            final_formatted: "¥2,800",
            discount_percent: 20,
          },
        })),
        eu: storeResult(storeData({
          short_description: "Trotze dem Gott der Toten.",
          about_the_game: "<p>Kämpfe. Stirb. Wiederhole.</p>",
          price_overview: {
            currency: "EUR",
            final_formatted: "24,99€",
            discount_percent: 0,
          },
        })),
      },
      {data: spy, warnings: []},
    );

    expect(result.warnings).toEqual([]);
    expect(result.data).toMatchObject({
      appid,
      name: "Hades",
      isFree: false,
      languages: ["English", "Japanese", "French"],
      tags: ["Roguelike", "Action"],
      prices: {
        us: {countryCode: "us", currency: "USD"},
        jp: {countryCode: "jp", currency: "JPY", discountPercent: 20},
        eu: {countryCode: "de", currency: "EUR"},
      },
      reviewStats: {positive: 95, negative: 5, positivePercent: 95},
      ccu: 12345,
      categories: ["Single-player", "Full controller support"],
      localizedStorefronts: {
        english: {
          countryCode: "us",
          requestedLanguage: "english",
          shortDescription: "Defy the god of the dead.",
          aboutTheGame: "Escape the Underworld\nFight. Die. Repeat.",
          aboutTheGameTruncated: false,
          matchesEnglishCopy: null,
        },
        japanese: {
          countryCode: "jp",
          requestedLanguage: "japanese",
          shortDescription: "冥界の神に抗え。",
          aboutTheGame: "戦い、死に、また挑め。",
          aboutTheGameTruncated: false,
          matchesEnglishCopy: false,
        },
        german: {
          countryCode: "de",
          requestedLanguage: "german",
          shortDescription: "Trotze dem Gott der Toten.",
          aboutTheGame: "Kämpfe. Stirb. Wiederhole.",
          aboutTheGameTruncated: false,
          matchesEnglishCopy: false,
        },
      },
      referenceLinks: {
        steamStore: "https://store.steampowered.com/app/1145360/",
        steamSonar: "https://www.steamsonar.gg/game/1145360",
        steamDb: "https://steamdb.info/app/1145360/",
      },
    });
  });

  it("treats a free game's missing price as normal", () => {
    const free = storeData({is_free: true, price_overview: undefined});
    const result = normalizeGameProfile(
      appid,
      {us: storeResult(free), jp: storeResult(free), eu: storeResult(free)},
      {data: spy, warnings: []},
    );

    expect(result.data?.prices).toEqual({us: null, jp: null, eu: null});
    expect(result.data?.localizedStorefronts.japanese?.matchesEnglishCopy).toBe(true);
    expect(result.data?.localizedStorefronts.german?.matchesEnglishCopy).toBe(true);
    expect(result.warnings.join()).not.toContain("price unavailable");
  });

  it("sanitizes and bounds localized about-the-game copy", () => {
    const oversized = `<script>ignore me</script><h2>Loop &amp; mastery</h2><p>${"x".repeat(12_100)}</p>`;
    const result = normalizeGameProfile(
      appid,
      {
        us: storeResult(storeData({about_the_game: oversized})),
        jp: storeResult(storeData()),
        eu: storeResult(storeData()),
      },
      {data: spy, warnings: []},
    );

    const english = result.data?.localizedStorefronts.english;
    expect(english?.aboutTheGame).toContain("Loop & mastery");
    expect(english?.aboutTheGame).not.toContain("<h2>");
    expect(english?.aboutTheGame).not.toContain("ignore me");
    expect(english?.aboutTheGame).toHaveLength(12_000);
    expect(english?.aboutTheGame.endsWith("…")).toBe(true);
    expect(english?.aboutTheGameTruncated).toBe(true);
  });

  it("normalizes CR newlines and never splits a Unicode surrogate pair", () => {
    const boundaryEmoji = `${"x".repeat(11_998)}😀tail`;
    const result = normalizeGameProfile(
      appid,
      {
        us: storeResult(storeData({about_the_game: boundaryEmoji})),
        jp: storeResult(storeData({about_the_game: "一行目\r\n二行目\r三行目"})),
        eu: storeResult(storeData()),
      },
      {data: spy, warnings: []},
    );

    const english = result.data?.localizedStorefronts.english?.aboutTheGame ?? "";
    expect(english.endsWith("…")).toBe(true);
    expect(english.charCodeAt(english.length - 2)).not.toBeGreaterThanOrEqual(0xD800);
    expect(result.data?.localizedStorefronts.japanese?.aboutTheGame)
      .toBe("一行目\n二行目\n三行目");
  });

  it("preserves partial data when a region and SteamSpy fail", () => {
    const result = normalizeGameProfile(
      appid,
      {
        us: storeResult(storeData()),
        jp: storeResult(null, ["steam store jp HTTP 503"]),
        eu: storeResult(storeData()),
      },
      {data: null, warnings: ["steamspy timeout"]},
    );

    expect(result.data?.name).toBe("Hades");
    expect(result.data?.prices.jp).toBeNull();
    expect(result.data?.localizedStorefronts.japanese).toBeNull();
    expect(result.data?.tags).toEqual([]);
    expect(result.data?.reviewStats).toBeNull();
    expect(result.warnings).toEqual([
      "steam store jp HTTP 503",
      "steamspy timeout",
      "steam store jp unavailable",
      "steamspy unavailable",
    ]);
  });

  it("does not divide by zero when SteamSpy has no reviews", () => {
    const result = normalizeGameProfile(
      appid,
      {us: storeResult(storeData()), jp: storeResult(storeData()), eu: storeResult(storeData())},
      {data: {...spy, positive: 0, negative: 0}, warnings: []},
    );

    expect(result.data?.reviewStats).toBeNull();
  });

  it("does not coerce missing or boolean numeric fields to zero", () => {
    const result = normalizeGameProfile(
      appid,
      {
        us: storeResult(storeData()),
        jp: storeResult(storeData({
          price_overview: {
            currency: "JPY",
            final_formatted: "¥2,800",
            discount_percent: null,
          },
        })),
        eu: storeResult(storeData()),
      },
      {data: {...spy, ccu: null, positive: null, negative: false}, warnings: []},
    );

    expect(result.data?.ccu).toBeNull();
    expect(result.data?.reviewStats).toBeNull();
    expect(result.data?.prices.jp).toBeNull();
  });

  it("warns when SteamSpy returns an unrecognized object", () => {
    const result = normalizeGameProfile(
      appid,
      {us: storeResult(storeData()), jp: storeResult(storeData()), eu: storeResult(storeData())},
      {data: {}, warnings: []},
    );

    expect(result.warnings).toContain("steamspy returned an invalid response");
  });

  it("returns null when the US store response is unavailable", () => {
    const result = normalizeGameProfile(
      appid,
      {us: storeResult(null), jp: storeResult(storeData()), eu: storeResult(storeData())},
      {data: spy, warnings: []},
    );

    expect(result.data).toBeNull();
    expect(result.warnings.join()).toContain("steam store us unavailable");
  });
});

describe("Steam fetch provenance", () => {
  it("adds deterministic, query-safe Steam Store metadata to search results", async () => {
    const fetcher = vi.fn(async () => ({
      data: {items: [{id: appid, name: "Hades"}]},
      warnings: [],
    }));
    const searchGames = createSearchGamesFetcher({now: () => NOW, fetcher});

    const result = await searchGames("  Hades  ");

    expect(result.data).toEqual([{appid, name: "Hades"}]);
    expect(result.meta).toEqual({
      observedAt: NOW.toISOString(),
      sources: [{
        name: "Steam Store",
        homepage: "https://store.steampowered.com/",
      }],
      request: {query: "Hades"},
      methodology: {selection: "Steam Store search results"},
    });
    expect(JSON.stringify(result.meta)).not.toContain("?term=");
    expect(JSON.stringify(result.meta)).not.toContain("l=english");
  });

  it("reports countries and explicit SteamSpy estimate caveats without request URLs", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      const parsed = new URL(url);
      if (parsed.hostname === "steamspy.com") return {data: spy, warnings: []};
      const country = parsed.searchParams.get("cc");
      return {
        data: {[appid]: {success: true, data: storeData({
          price_overview: {
            currency: country === "jp" ? "JPY" : country === "de" ? "EUR" : "USD",
            final_formatted: "24.99",
            discount_percent: 0,
          },
        })}},
        warnings: [],
      };
    });
    const fetchGame = createGameFetcher({now: () => NOW, fetcher});

    const result = await fetchGame(appid);

    expect(result.data?.name).toBe("Hades");
    expect(result.meta?.observedAt).toBe(NOW.toISOString());
    expect(result.meta?.request).toEqual({countries: ["US", "JP", "DE"]});
    expect(fetcher.mock.calls
      .map(([url]) => new URL(url))
      .filter((url) => url.hostname === "store.steampowered.com")
      .map((url) => [url.searchParams.get("cc"), url.searchParams.get("l")]))
      .toEqual([
        ["us", "english"],
        ["jp", "japanese"],
        ["de", "german"],
      ]);
    expect(result.meta?.sources?.map((source) => source.name))
      .toEqual(["Steam Store", "SteamSpy"]);
    const spyNotes = result.meta?.sources?.find((source) => source.name === "SteamSpy")?.notes;
    expect(spyNotes).toMatch(/owners.*estimate/i);
    expect(spyNotes).toMatch(/not sales/i);
    expect(spyNotes).toMatch(/recent.*small sample.*unreliable/i);
    const metaJson = JSON.stringify(result.meta);
    expect(metaJson).not.toContain("appids=");
    expect(metaJson).not.toContain("request=appdetails");
    expect(metaJson).not.toContain("api.php?");
  });
});
