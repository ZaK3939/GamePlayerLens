import {describe, expect, it, vi} from "vitest";
import {createDeveloperBriefFetcher} from "./brief.js";
import type {DiscoveryResult} from "./discovery.js";
import type {FetchResult} from "./http.js";
import type {Review} from "./reviews.js";
import type {GameProfile} from "./steam.js";
import type {Timeline} from "./timeline.js";
import type {SteamUpdateHistory} from "./updates.js";

const NOW = new Date("2026-08-13T12:00:00.000Z");

function profile(): FetchResult<GameProfile> {
  return {
    data: {
      appid: 1145360,
      name: "Hades",
      shortDescription: "Defy the god of the dead.",
      releaseDate: "17 Sep, 2020",
      isFree: false,
      tags: ["Action Roguelike", "Rogue-lite"],
      genres: ["Action", "Indie"],
      categories: ["Single-player"],
      languages: ["English", "Japanese"],
      localizedStorefronts: {
        english: {
          countryCode: "us",
          requestedLanguage: "english",
          shortDescription: "Defy the god of the dead.",
          aboutTheGame: "English body",
          aboutTheGameTruncated: false,
          matchesEnglishCopy: true,
        },
        japanese: {
          countryCode: "jp",
          requestedLanguage: "japanese",
          shortDescription: "冥界から脱出せよ。",
          aboutTheGame: "Japanese body",
          aboutTheGameTruncated: false,
          matchesEnglishCopy: false,
        },
        german: null,
      },
      prices: {
        us: {countryCode: "us", currency: "USD", finalFormatted: "$24.99", discountPercent: 0},
        jp: {countryCode: "jp", currency: "JPY", finalFormatted: "¥ 2,800", discountPercent: 0},
        eu: {countryCode: "de", currency: "EUR", finalFormatted: "24,50€", discountPercent: 0},
      },
      reviewStats: {positive: 100, negative: 2, positivePercent: 98},
      ccu: 100,
      owners: "1,000,000 .. 2,000,000",
      screenshots: ["https://example.com/shot.jpg"],
      referenceLinks: {
        steamStore: "https://store.steampowered.com/app/1145360",
        steamSonar: "https://steamsonar.com/app/1145360",
        steamDb: "https://steamdb.info/app/1145360",
      },
    },
    warnings: [],
    meta: {
      observedAt: "2026-08-13T11:55:00.000Z",
      sources: [{name: "Steam Store", homepage: "https://store.steampowered.com/"}],
    },
  };
}

function review(id: string, votedUp: boolean, text = "Useful bounded review"): Review {
  return {
    recommendationId: id,
    review: text,
    votedUp,
    playtimeHours: 12.5,
    language: "japanese",
    timestamp: 1_700_000_000,
  };
}

function timeline(): FetchResult<Timeline> {
  return {
    data: {
      observedAt: "2026-08-13T11:56:00.000Z",
      currentCcu: 250,
      owners: "2,000,000 .. 5,000,000",
      avgPlaytimeHours: 18.4,
      priceHistory: [
        {date: "2026-08-01T00:00:00.000Z", amount: 24.99, currency: "USD", discountPercent: 0},
        {date: "2026-07-01T00:00:00.000Z", amount: 12.49, currency: "USD", discountPercent: 50},
      ],
      priceHistorySince: "2025-08-13T00:00:00.000Z",
      country: "JP",
    },
    warnings: ["ITAD price history disabled"],
    meta: {observedAt: "2026-08-13T11:56:00.000Z"},
  };
}

function updates(): FetchResult<SteamUpdateHistory> {
  return {
    data: {
      appid: 1145360,
      items: [{
        gid: "update-1",
        title: "Patch 1",
        url: "https://example.com/update-1",
        author: "Developer",
        publishedAt: "2026-08-01T00:00:00.000Z",
        feedLabel: "Community Announcements",
        official: true,
        tags: ["patchnotes"],
        type: "fixes",
        typeConfidence: 1,
        isUpdateLike: true,
        updateEvidence: "steam-tag",
        updateConfidence: 1,
        platformHints: ["steam"],
        classificationBasis: ["patchnotes tag"],
        summary: "Fixed an issue.",
        highlights: ["Fixed an issue"],
        detailsPreview: "Details",
        content: "Full update content",
      }],
      summary: {
        apiReportedTotal: 1,
        fetchedCount: 1,
        returnedCount: 1,
        officialCount: 1,
        externalCount: 0,
        fetchedTaggedPatchNotesCount: 1,
        taggedPatchNotesCount: 1,
        titleInferredUpdateCount: 0,
        latestPublishedAt: "2026-08-01T00:00:00.000Z",
        earliestPublishedAt: "2026-08-01T00:00:00.000Z",
        medianIntervalDays: null,
        typeCounts: {fixes: 1},
      },
      referenceLinks: {
        steamCommunityNews: "https://example.com/news",
        steamSonar: "https://steamsonar.com/app/1145360",
      },
    },
    warnings: [],
    meta: {observedAt: "2026-08-13T11:57:00.000Z"},
  };
}

function discovery(): FetchResult<DiscoveryResult> {
  return {
    data: {
      query: {
        kind: "tag",
        value: "Action Roguelike",
        excludeAppids: [1145360],
        limit: 5,
      },
      observedAt: "2026-08-13T11:58:00.000Z",
      candidates: [{
        rank: 1,
        appid: 588650,
        name: "Dead Cells",
        owners: "5,000,000 .. 10,000,000",
        ccu: 1_000,
        positive: 100,
        negative: 10,
        positivePercent: 91,
      }],
      methodology: {
        ranking: "SteamSpy order",
        figures: "estimates",
        owners: "estimate range",
        reliability: "bounded",
        representative: false,
      },
    },
    warnings: [],
    meta: {observedAt: "2026-08-13T11:58:00.000Z"},
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const fetchGame = vi.fn(async () => profile());
  const fetchReviews = vi.fn(async (_appid: number, options?: {type?: string}) => ({
    data: options?.type === "positive"
      ? [review("positive-1", true, "x".repeat(700))]
      : [review("negative-1", false)],
    warnings: [],
    meta: {observedAt: "2026-08-13T11:56:00.000Z"},
  }));
  const fetchTimeline = vi.fn(async () => timeline());
  const fetchUpdates = vi.fn(async () => updates());
  const discoverGames = vi.fn(async () => discovery());
  return {
    clock: () => NOW,
    fetchGame,
    fetchReviews,
    fetchTimeline,
    fetchUpdates,
    discoverGames,
    ...overrides,
  };
}

describe("Steam developer brief", () => {
  it("compresses a traceable multi-source first pass into decision coverage", async () => {
    const deps = dependencies();
    const fetchBrief = createDeveloperBriefFetcher(deps);
    const result = await fetchBrief({
      appid: 1145360,
      language: "japanese",
      country: "jp",
    });

    expect(result.data).toMatchObject({
      schemaVersion: 1,
      purpose: "first-pass-developer-triage",
      assembledAt: NOW.toISOString(),
      audience: {language: "japanese", country: "JP"},
      target: {
        name: "Hades",
        localizedCopy: {
          status: "distinct-from-english",
          shortDescription: "冥界から脱出せよ。",
        },
        priceHistorySummary: {
          country: "JP",
          pointCount: 2,
          latest: {amount: 24.99},
          lowestByCurrency: [{amount: 12.49}],
        },
        currentCcu: 250,
        currentCcuSource: "steam_timeline",
        owners: "2,000,000 .. 5,000,000",
        ownersSource: "steam_timeline",
      },
      evidence: {
        reviews: {
          requestedPerPolarity: 8,
          positive: [{
            recommendationId: "positive-1",
            truncated: true,
          }],
          negative: [{recommendationId: "negative-1"}],
        },
        updates: {recentItems: [{title: "Patch 1", type: "fixes"}]},
        competition: {
          selection: {kind: "tag", value: "Action Roguelike"},
          candidates: [{name: "Dead Cells"}],
        },
      },
      readiness: {
        status: "ready",
        supportedDecisions: expect.arrayContaining([
          "store-positioning-review",
          "regional-price-comparison",
          "localized-copy-review",
          "review-friction-hypotheses",
          "current-activity-context",
          "update-strategy-review",
          "competitor-shortlist",
        ]),
        unsupportedClaims: expect.arrayContaining([
          "gameplay quality without direct playtest evidence",
          "causal conversion or retention impact",
        ]),
      },
    });
    expect(result.data?.evidence.reviews.positive[0]?.excerpt.length).toBeLessThanOrEqual(600);
    expect(result.warnings).toEqual(["steam_timeline: ITAD price history disabled"]);
    expect(deps.fetchReviews).toHaveBeenNthCalledWith(1, 1145360, {
      language: "japanese",
      type: "positive",
      limit: 8,
    });
    expect(deps.discoverGames).toHaveBeenCalledWith({
      kind: "tag",
      value: "Action Roguelike",
      excludeAppids: [1145360],
      limit: 5,
    });
  });

  it("keeps partial source failures visible and gives concrete next actions", async () => {
    const deps = dependencies({
      fetchReviews: vi.fn(async () => ({
        data: null,
        warnings: ["steam reviews unreachable"],
      })),
      fetchUpdates: vi.fn(async () => ({data: null, warnings: ["steam news timeout"]})),
      discoverGames: vi.fn(async () => ({
        data: {...discovery().data!, candidates: []},
        warnings: ["steamspy discovery returned no candidates"],
      })),
    });
    const result = await createDeveloperBriefFetcher(deps)({
      appid: 1145360,
      language: "koreana",
      country: "KR",
      reviewLimit: 4,
    });

    expect(result.data?.readiness).toMatchObject({
      status: "partial",
      supportedDecisions: expect.not.arrayContaining(["review-friction-hypotheses"]),
      gaps: expect.arrayContaining([
        expect.stringContaining("review-friction"),
        expect.stringContaining("localized-copy"),
        expect.stringContaining("competition-shortlist"),
      ]),
      nextActions: expect.arrayContaining([
        expect.stringContaining("steam_reviews"),
        expect.stringContaining("steam_discover"),
        expect.stringContaining("steam_updates"),
        expect.stringContaining("actual koreana store copy"),
      ]),
    });
    expect(result.data?.provenance).toEqual(expect.arrayContaining([{
      sourceTool: "steam_discover",
      status: "empty",
      warnings: ["steamspy discovery returned no candidates"],
    }]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      "steam_reviews:positive: steam reviews unreachable",
      "steam_reviews:negative: steam reviews unreachable",
      "steam_updates: steam news timeout",
      "steam_discover: steamspy discovery returned no candidates",
    ]));
  });

  it("keeps other evidence when external dependencies unexpectedly throw", async () => {
    const deps = dependencies({
      fetchTimeline: vi.fn(async () => {
        throw new Error("https://secret.example/timeline?token=do-not-leak");
      }),
      discoverGames: vi.fn(async () => {
        throw new Error("private upstream response body");
      }),
    });

    const result = await createDeveloperBriefFetcher(deps)({
      appid: 1145360,
      language: "japanese",
      country: "JP",
    });

    expect(result.data).toMatchObject({
      target: {appid: 1145360, name: "Hades"},
      evidence: {
        reviews: {positive: [{recommendationId: "positive-1"}]},
        updates: {recentItems: [{gid: "update-1"}]},
        competition: {candidates: []},
      },
      readiness: {
        status: "partial",
        gaps: expect.arrayContaining([
          expect.stringContaining("current-indicators"),
          expect.stringContaining("competition-shortlist"),
        ]),
      },
      provenance: expect.arrayContaining([
        expect.objectContaining({sourceTool: "steam_timeline", status: "unavailable"}),
        expect.objectContaining({sourceTool: "steam_discover", status: "unavailable"}),
      ]),
    });
    expect(result.warnings).toEqual(expect.arrayContaining([
      "steam_timeline: unexpected dependency failure",
      "steam_discover: unexpected dependency failure",
    ]));
    expect(JSON.stringify(result)).not.toContain("do-not-leak");
    expect(JSON.stringify(result)).not.toContain("private upstream response body");
  });

  it("does not overstate incomplete prices, fallback-like copy, or current indicators", async () => {
    const sparseProfile = profile();
    sparseProfile.data!.tags = [];
    sparseProfile.data!.prices = {
      us: null,
      jp: {countryCode: "jp", currency: "JPY", finalFormatted: "¥ 2,800", discountPercent: 0},
      eu: null,
    };
    sparseProfile.data!.localizedStorefronts.japanese = {
      ...sparseProfile.data!.localizedStorefronts.english!,
      countryCode: "jp",
      requestedLanguage: "japanese",
      matchesEnglishCopy: true,
    };
    const sparseTimeline = timeline();
    sparseTimeline.data = {
      ...sparseTimeline.data!,
      owners: null,
      avgPlaytimeHours: null,
    };
    const deps = dependencies({
      fetchGame: vi.fn(async () => sparseProfile),
      fetchTimeline: vi.fn(async () => sparseTimeline),
    });

    const result = await createDeveloperBriefFetcher(deps)({
      appid: 1145360,
      language: "japanese",
      country: "jp",
    });

    expect(deps.discoverGames).toHaveBeenCalledWith(expect.objectContaining({
      kind: "genre",
      value: "Action",
    }));
    expect(result.data?.evidence.competition.selection).toEqual({
      kind: "genre",
      value: "Action",
    });
    expect(result.data?.readiness).toMatchObject({
      status: "partial",
      dimensions: expect.arrayContaining([
        expect.objectContaining({dimension: "regional-pricing", status: "partial"}),
        expect.objectContaining({dimension: "localized-copy", status: "partial"}),
        expect.objectContaining({dimension: "current-indicators", status: "partial"}),
      ]),
    });
    expect(result.data?.target).toMatchObject({
      currentCcuSource: "steam_timeline",
      ownersSource: "steam_fetch",
    });
    expect(result.data?.readiness.supportedDecisions)
      .not.toContain("regional-price-comparison");
    expect(result.data?.readiness.supportedDecisions)
      .not.toContain("localized-copy-review");
    expect(result.data?.readiness.supportedDecisions)
      .not.toContain("current-activity-context");
  });

  it("blocks product advice when the target profile cannot be resolved", async () => {
    const discoverGames = vi.fn(async () => discovery());
    const deps = dependencies({
      fetchGame: vi.fn(async () => ({data: null, warnings: ["steam store unavailable"]})),
      discoverGames,
    });
    const result = await createDeveloperBriefFetcher(deps)({
      appid: 999,
      language: "english",
      country: "US",
    });

    expect(result.data).toMatchObject({
      target: null,
      evidence: {competition: {selection: null, candidates: []}},
      readiness: {
        status: "blocked",
        nextActions: expect.arrayContaining([
          expect.stringContaining("Verify the appid"),
        ]),
      },
      provenance: expect.arrayContaining([{
        sourceTool: "steam_discover",
        status: "not-requested",
        warnings: ["target profile has no SteamSpy tag for automatic competitor discovery"],
      }]),
    });
    expect(discoverGames).not.toHaveBeenCalled();
  });
});
