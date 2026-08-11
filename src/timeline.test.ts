import {describe, expect, it, vi} from "vitest";
import {createTimelineFetcher, resolveTimelineOptions} from "./timeline.js";
import type {FetchResult} from "./http.js";

const NOW = new Date("2026-08-11T00:00:00.000Z");

function spyData(overrides: Record<string, unknown> = {}) {
  return {
    appid: 1145360,
    ccu: 1234,
    owners: "5,000,000 .. 10,000,000",
    average_forever: 95,
    ...overrides,
  };
}

describe("resolveTimelineOptions", () => {
  it("defaults to US and exactly 365 days before the observation time", () => {
    expect(resolveTimelineOptions({}, NOW)).toEqual({
      country: "US",
      since: "2025-08-11T00:00:00.000Z",
    });
  });

  it("normalizes valid country and since values", () => {
    expect(resolveTimelineOptions({country: "jp", since: "2026-01-02T03:04:05Z"}, NOW))
      .toEqual({country: "JP", since: "2026-01-02T03:04:05.000Z"});
  });
});

describe("createTimelineFetcher", () => {
  it("returns the SteamSpy snapshot and setup guidance without an ITAD key", async () => {
    const fetcher = vi.fn(async () => ({data: spyData(), warnings: []}));
    const fetchTimeline = createTimelineFetcher({
      apiKey: "  ",
      now: () => NOW,
      fetcher,
    });

    const result = await fetchTimeline(1145360);
    expect(result.data).toEqual({
      observedAt: NOW.toISOString(),
      currentCcu: 1234,
      owners: "5,000,000 .. 10,000,000",
      avgPlaytimeHours: 1.6,
      priceHistory: null,
      priceHistorySince: null,
      country: "US",
    });
    expect(result.warnings).toEqual([
      "ITAD price history disabled: create an API key at https://isthereanydeal.com/apps/my/ and set ITAD_API_KEY",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves ITAD currency and maps the discount cut", async () => {
    const fetcher = vi.fn(async (url: string | URL): Promise<FetchResult<unknown>> => {
      const parsed = new URL(url);
      if (parsed.hostname === "steamspy.com") return {data: spyData(), warnings: []};
      if (parsed.pathname.endsWith("/lookup/v1")) {
        return {data: {found: true, game: {id: "game-uuid"}}, warnings: []};
      }
      return {
        data: [{
          timestamp: "2026-03-01T12:00:00+01:00",
          deal: {price: {amount: 9.99, currency: "EUR"}, cut: 60},
        }],
        warnings: [],
      };
    });
    const fetchTimeline = createTimelineFetcher({
      apiKey: "secret-key",
      now: () => NOW,
      fetcher,
    });

    const result = await fetchTimeline(1145360, {
      country: "de",
      since: "2026-01-01T00:00:00Z",
    });
    expect(result.data?.priceHistory).toEqual([{
      date: "2026-03-01T12:00:00+01:00",
      amount: 9.99,
      currency: "EUR",
      discountPercent: 60,
    }]);
    expect(result.data?.priceHistorySince).toBe("2026-01-01T00:00:00.000Z");
    expect(result.data?.country).toBe("DE");

    const historyUrl = new URL(String(fetcher.mock.calls[2]?.[0]));
    expect(historyUrl.searchParams.get("shops")).toBe("61");
    expect(historyUrl.searchParams.get("country")).toBe("DE");
    expect(historyUrl.searchParams.get("since")).toBe("2026-01-01T00:00:00.000Z");
  });

  it("warns when the ITAD lookup does not find the app", async () => {
    const fetcher = vi.fn(async (url: string | URL): Promise<FetchResult<unknown>> => {
      const parsed = new URL(url);
      return parsed.hostname === "steamspy.com"
        ? {data: spyData(), warnings: []}
        : {data: {found: false}, warnings: []};
    });
    const result = await createTimelineFetcher({
      apiKey: "secret-key",
      now: () => NOW,
      fetcher,
    })(1145360);

    expect(result.data?.priceHistory).toBeNull();
    expect(result.data?.priceHistorySince).toBeNull();
    expect(result.warnings).toContain("ITAD has no game mapping for Steam appid 1145360");
  });

  it("keeps ITAD history when SteamSpy fails", async () => {
    const fetcher = vi.fn(async (url: string | URL): Promise<FetchResult<unknown>> => {
      const parsed = new URL(url);
      if (parsed.hostname === "steamspy.com") {
        return {data: null, warnings: ["steamspy timeout"]};
      }
      if (parsed.pathname.endsWith("/lookup/v1")) {
        return {data: {found: true, game: {id: "game-uuid"}}, warnings: []};
      }
      return {
        data: [{
          timestamp: "2026-04-01T00:00:00Z",
          deal: {price: {amount: 12, currency: "USD"}, cut: 20},
        }],
        warnings: [],
      };
    });
    const result = await createTimelineFetcher({
      apiKey: "secret-key",
      now: () => NOW,
      fetcher,
    })(1145360);

    expect(result.data?.currentCcu).toBeNull();
    expect(result.data?.priceHistory).toHaveLength(1);
    expect(result.warnings).toContain("steamspy timeout");
  });
});
