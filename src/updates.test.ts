import {describe, expect, it, vi} from "vitest";
import {
  createUpdatesFetcher,
  normalizeSteamUpdates,
} from "./updates.js";

const NOW = new Date("2026-08-12T00:00:00.000Z");

function item(overrides: Record<string, unknown> = {}) {
  return {
    gid: "100",
    title: "Post-Launch Patch - August 2026",
    url: "https://steamcommunity.com/games/10/announcements/detail/100",
    is_external_url: false,
    author: "Developer",
    contents: "[h1]Fixes[/h1]\n[list][*]Improved input feedback[/list]",
    feedlabel: "Community Announcements",
    date: 1_755_000_000,
    feed_type: 1,
    appid: 10,
    tags: ["patchnotes"],
    ...overrides,
  };
}

describe("Steam update normalization", () => {
  it("separates authoritative patch tags from title-inferred updates", () => {
    const result = normalizeSteamUpdates(10, {
      appnews: {
        appid: 10,
        count: 4,
        newsitems: [
          item(),
          item({
            gid: "101",
            title: "Cross-Saves Update Out Now",
            date: 1_746_360_000,
            tags: [],
          }),
          item({
            gid: "102",
            title: "Studio Anniversary Concert",
            date: 1_737_720_000,
            tags: [],
          }),
          item({
            gid: "103",
            title: "A review from a news site",
            feedlabel: "Example News",
            feed_type: 0,
            date: 1_729_080_000,
            tags: [],
          }),
        ],
      },
    }, {scope: "updates", limit: 20, contentChars: 1_200});

    expect(result.data?.items).toHaveLength(2);
    expect(result.data?.items.map(({type, isUpdateLike, classificationBasis}) => [
      type,
      isUpdateLike,
      classificationBasis,
    ]))
      .toEqual([
        ["fixes", true, ["steam-tag:patchnotes", "title-keyword:patch"]],
        ["content", true, ["title-keyword:update", "title-keyword:cross-save"]],
      ]);
    expect(result.data?.items[0]).toMatchObject({
      typeConfidence: 0.8,
      updateEvidence: "steam-tag",
      updateConfidence: 1,
      summary: "Improved input feedback",
      highlights: ["Improved input feedback"],
    });
    expect(result.data?.items[1]).toMatchObject({
      typeConfidence: 0.9,
      updateEvidence: "title-inference",
      updateConfidence: 0.75,
      platformHints: [],
    });
    expect(result.data?.items[0]?.content).toBe("Fixes Improved input feedback");
    expect(result.data?.summary).toMatchObject({
      apiReportedTotal: 4,
      fetchedCount: 4,
      returnedCount: 2,
      officialCount: 3,
      externalCount: 1,
      fetchedTaggedPatchNotesCount: 1,
      taggedPatchNotesCount: 1,
      titleInferredUpdateCount: 1,
      medianIntervalDays: 100,
      typeCounts: {fixes: 1, content: 1},
    });
    expect(result.data?.referenceLinks).toEqual({
      steamCommunityNews: "https://store.steampowered.com/news/app/10",
      steamSonar: "https://www.steamsonar.gg/game/10",
    });
    expect(result.warnings).toEqual([
      "steam updates returned 2 of requested 20 high-precision update item(s)",
    ]);
  });

  it("does not promote body-only mentions into updates or major releases", () => {
    const result = normalizeSteamUpdates(10, {appnews: {
      appid: 10,
      count: 6,
      newsitems: [
        item({
          gid: "sequel",
          title: "Our Next Game Is Coming to Early Access",
          contents: "The sequel will reach its v1.0 launch next year.",
          tags: [],
        }),
        item({
          gid: "award",
          title: "Nominated for Game of the Year",
          contents: "Play the demo from the store page.",
          tags: [],
        }),
        item({
          gid: "patch",
          title: "Post-Launch Patch - February",
          contents: "Following our v1.0 launch, this resolves several issues.",
        }),
        item({
          gid: "launch",
          title: "v1.0 Launch Update - Patch Notes",
          contents: "Full release notes.",
          tags: [],
        }),
        item({
          gid: "empty",
          title: "Update 12",
          contents: "",
          tags: [],
        }),
        item({
          gid: "event-word",
          title: "Post-Launch Patch 2 Notes",
          contents: "Resolved an issue in the story event and improved stability.",
          tags: [],
        }),
      ],
    }}, {scope: "updates", limit: 20, contentChars: 1_200});

    expect(result.data?.items.map(({gid, type}) => [gid, type])).toEqual([
      ["patch", "fixes"],
      ["launch", "major"],
      ["empty", "content"],
      ["event-word", "fixes"],
    ]);
    expect(result.data?.items.find(({gid}) => gid === "patch")).toMatchObject({
      typeConfidence: 0.8,
      classificationBasis: ["steam-tag:patchnotes", "title-keyword:patch"],
    });
    expect(result.data?.items.find(({gid}) => gid === "empty")?.summary).toBe("Update 12");
  });

  it("matches update title tokens on boundaries and keeps plural forms", () => {
    const result = normalizeSteamUpdates(10, {appnews: {
      appid: 10,
      count: 4,
      newsitems: [
        item({gid: "dispatch", title: "Dispatch from the Community", tags: []}),
        item({gid: "updated", title: "Updated Community Guidelines", tags: []}),
        item({gid: "updates", title: "Updates for August", tags: []}),
        item({gid: "patches", title: "Patches 3 and 4", tags: []}),
      ],
    }}, {scope: "updates", limit: 20, contentChars: 1_200});

    expect(result.data?.items.map(({gid, classificationBasis}) => [gid, classificationBasis]))
      .toEqual([
        ["updates", ["title-keyword:update"]],
        ["patches", ["title-keyword:patch"]],
      ]);
  });

  it("prefers an explicit hotfix over a generic v1.0 release marker", () => {
    const result = normalizeSteamUpdates(10, {appnews: {
      appid: 10,
      count: 2,
      newsitems: [
        item({gid: "hotfix", title: "Version 1.0 Hotfix", tags: []}),
        item({gid: "wholesale", title: "Wholesale Update", tags: []}),
      ],
    }}, {scope: "updates", limit: 20, contentChars: 1_200});

    expect(result.data?.items.map(({gid, type}) => [gid, type])).toEqual([
      ["hotfix", "fixes"],
      ["wholesale", "general"],
    ]);
  });

  it("exposes title-only platform hints without excluding cross-platform updates", () => {
    const result = normalizeSteamUpdates(10, {appnews: {
      appid: 10,
      count: 3,
      newsitems: [
        item({gid: "switch", title: "Cross-Saves Update Out Now on Nintendo Switch", tags: []}),
        item({gid: "mobile", title: "Mobile Update Available on iOS and Android", tags: []}),
        item({gid: "mac", title: "Hotfix for Mac and Steam Deck", tags: []}),
      ],
    }}, {scope: "updates", limit: 20, contentChars: 1_200});

    expect(result.data?.items.map(({gid, platformHints}) => [gid, platformHints])).toEqual([
      ["switch", ["nintendo-switch"]],
      ["mobile", ["mobile", "ios", "android"]],
      ["mac", ["macos", "steam-deck"]],
    ]);
  });

  it("keeps announcements in official scope and external items only in all scope", () => {
    const raw = {appnews: {appid: 10, count: 2, newsitems: [
      item({gid: "official", title: "Community Event", tags: []}),
      item({
        gid: "external",
        title: "External story",
        feed_type: 0,
        feedlabel: "Example News",
        tags: [],
      }),
    ]}};

    expect(normalizeSteamUpdates(10, raw, {
      scope: "official",
      limit: 20,
      contentChars: 1_200,
    }).data?.items.map((entry) => entry.gid)).toEqual(["official"]);
    expect(normalizeSteamUpdates(10, raw, {
      scope: "all",
      limit: 20,
      contentChars: 1_200,
    }).data?.items.map((entry) => entry.gid)).toEqual(["official", "external"]);
  });

  it("skips malformed entries, deduplicates gids, and reports an underfilled update scope", () => {
    const result = normalizeSteamUpdates(10, {appnews: {
      appid: 10,
      count: 8,
      newsitems: [
        item(),
        item({title: "duplicate"}),
        item({gid: "", title: "missing gid"}),
        item({gid: "bad-date", date: "tomorrow"}),
        item({gid: "announcement", title: "Merchandise", tags: []}),
      ],
    }}, {scope: "updates", limit: 5, contentChars: 300});

    expect(result.data?.items).toHaveLength(1);
    expect(result.warnings).toEqual([
      "steam news skipped 2 invalid item(s)",
      "steam news skipped 1 duplicate item(s)",
      "steam updates returned 1 of requested 5 high-precision update item(s)",
    ]);
  });

  it("rejects a mismatched response appid instead of mixing evidence", () => {
    const result = normalizeSteamUpdates(10, {
      appnews: {appid: "99", count: 1, newsitems: [item()]},
    }, {scope: "updates", limit: 5, contentChars: 300});

    expect(result.data).toBeNull();
    expect(result.warnings).toEqual([
      "steam news response appid 99 did not match requested appid 10",
    ]);
  });

  it("rejects a response without a valid appid", () => {
    const result = normalizeSteamUpdates(10, {
      appnews: {count: 1, newsitems: [item()]},
    }, {scope: "updates", limit: 5, contentChars: 300});

    expect(result).toEqual({
      data: null,
      warnings: ["steam news response did not include a valid appid"],
    });
  });
});

describe("Steam update fetcher", () => {
  it("uses the official feed for update scope and returns traceable metadata", async () => {
    const fetcher = vi.fn(async () => ({
      data: {appnews: {appid: 10, count: 1, newsitems: [item()]}},
      warnings: [],
    }));
    const fetchUpdates = createUpdatesFetcher({fetcher, now: () => NOW});

    const result = await fetchUpdates(10, {
      scope: "updates",
      limit: 8,
      contentChars: 900,
      before: "2026-08-01T00:00:00.000Z",
    });

    const url = fetcher.mock.calls[0]?.[0] as URL;
    expect(url.origin + url.pathname)
      .toBe("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      appid: "10",
      count: "32",
      maxlength: "900",
      format: "json",
      feeds: "steam_community_announcements",
      enddate: "1785542400",
    });
    expect(result.meta).toMatchObject({
      observedAt: NOW.toISOString(),
      request: {
        appid: 10,
        scope: "updates",
        limit: 8,
        contentChars: 900,
        before: "2026-08-01T00:00:00.000Z",
      },
      methodology: {
        updateSelection: "Steam patchnotes tag or bounded title-keyword inference; body text never selects an update",
        causalClaims: false,
      },
    });
  });

  it("validates bounded public inputs", async () => {
    const fetchUpdates = createUpdatesFetcher({fetcher: vi.fn()});

    await expect(fetchUpdates(0)).rejects.toThrow(/appid/i);
    await expect(fetchUpdates(10, {limit: 101})).rejects.toThrow(/limit/i);
    await expect(fetchUpdates(10, {contentChars: 99})).rejects.toThrow(/contentChars/i);
    await expect(fetchUpdates(10, {before: "not-a-date"})).rejects.toThrow(/before/i);
    await expect(fetchUpdates(10, {before: "2026-08-01"})).rejects.toThrow(/before/i);
  });
});
