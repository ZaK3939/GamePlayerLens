import {describe, expect, it} from "vitest";
import {normalizeGameProfile, parseSupportedLanguages} from "./steam.js";

const appid = 1145360;

function storeData(overrides: Record<string, unknown> = {}) {
  return {
    name: "Hades",
    steam_appid: appid,
    is_free: false,
    short_description: "Defy the god of the dead.",
    supported_languages: "English<strong>*</strong>, Japanese, French*",
    price_overview: {
      currency: "USD",
      final_formatted: "$24.99",
      discount_percent: 0,
    },
    release_date: {date: "Sep 17, 2020"},
    genres: [{description: "Action"}, {description: "RPG"}],
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
          price_overview: {
            currency: "JPY",
            final_formatted: "¥2,800",
            discount_percent: 20,
          },
        })),
        eu: storeResult(storeData({
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
    expect(result.warnings.join()).not.toContain("price unavailable");
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
