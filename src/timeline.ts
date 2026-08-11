import {fetchJson, type FetchResult} from "./http.js";

const STEAMSPY_API = "https://steamspy.com/api.php";
const ITAD_API = "https://api.isthereanydeal.com";
const STEAM_SHOP_ID = "61";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PriceHistoryPoint {
  date: string;
  amount: number;
  currency: string;
  discountPercent: number;
}

export interface Timeline {
  observedAt: string;
  currentCcu: number | null;
  owners: string | null;
  avgPlaytimeHours: number | null;
  priceHistory: PriceHistoryPoint[] | null;
  priceHistorySince: string | null;
  country: string;
}

export interface TimelineOptions {
  since?: string;
  country?: string;
}

export interface ResolvedTimelineOptions {
  since: string;
  country: string;
}

interface RawSteamSpy {
  ccu?: unknown;
  owners?: unknown;
  average_forever?: unknown;
}

interface ItadLookup {
  found?: unknown;
  game?: {id?: unknown};
}

interface RawHistoryPoint {
  timestamp?: unknown;
  deal?: {
    price?: {amount?: unknown; currency?: unknown};
    cut?: unknown;
  };
}

interface PriceHistoryResult {
  data: PriceHistoryPoint[] | null;
  since: string | null;
  warnings: string[];
}

type TimelineJsonFetcher = (
  url: string | URL,
  opts?: {timeoutMs?: number; source?: string},
) => Promise<FetchResult<unknown>>;

export interface TimelineDependencies {
  apiKey?: string;
  now?: () => Date;
  fetcher?: TimelineJsonFetcher;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function requireAppid(appid: number): void {
  if (!Number.isInteger(appid) || appid <= 0) {
    throw new TypeError("appid must be a positive integer");
  }
}

export function resolveTimelineOptions(
  opts: TimelineOptions = {},
  now = new Date(),
): ResolvedTimelineOptions {
  const country = (opts.country ?? "US").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new TypeError("country must be an ISO 3166-1 alpha-2 code");
  }

  let sinceDate: Date;
  if (opts.since === undefined) {
    sinceDate = new Date(now.getTime() - 365 * DAY_MS);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(opts.since)) {
      throw new TypeError("since must be an ISO 8601 date-time");
    }
    sinceDate = new Date(opts.since);
    if (Number.isNaN(sinceDate.getTime())) {
      throw new TypeError("since must be an ISO 8601 date-time");
    }
  }

  return {country, since: sinceDate.toISOString()};
}

function normalizeHistory(data: unknown): PriceHistoryPoint[] {
  if (!Array.isArray(data)) return [];
  return (data as RawHistoryPoint[]).flatMap((raw) => {
    const date = typeof raw.timestamp === "string" ? raw.timestamp : "";
    const amount = finiteNumber(raw.deal?.price?.amount);
    const currency =
      typeof raw.deal?.price?.currency === "string"
        ? raw.deal.price.currency.trim()
        : "";
    const discountPercent = finiteNumber(raw.deal?.cut);
    if (!date || amount === null || !currency || discountPercent === null) return [];
    return [{date, amount, currency, discountPercent}];
  });
}

export function normalizeTimelineSnapshot(
  observedAt: Date,
  country: string,
  spyResult: FetchResult<RawSteamSpy>,
  historyResult: PriceHistoryResult,
): FetchResult<Timeline> {
  const ccu = finiteNumber(spyResult.data?.ccu);
  const averageMinutes = finiteNumber(spyResult.data?.average_forever);
  return {
    data: {
      observedAt: observedAt.toISOString(),
      currentCcu: ccu !== null && ccu >= 0 ? ccu : null,
      owners:
        typeof spyResult.data?.owners === "string" ? spyResult.data.owners : null,
      avgPlaytimeHours:
        averageMinutes !== null && averageMinutes >= 0
          ? Math.round((averageMinutes / 60) * 10) / 10
          : null,
      priceHistory: historyResult.data,
      priceHistorySince: historyResult.since,
      country,
    },
    warnings: [...spyResult.warnings, ...historyResult.warnings],
  };
}

async function fetchItadHistory(
  appid: number,
  options: ResolvedTimelineOptions,
  apiKey: string,
  fetcher: TimelineJsonFetcher,
): Promise<PriceHistoryResult> {
  const lookupUrl = new URL("/games/lookup/v1", ITAD_API);
  lookupUrl.searchParams.set("key", apiKey);
  lookupUrl.searchParams.set("appid", String(appid));
  const lookup = await fetcher(lookupUrl, {source: "ITAD lookup"});
  if (!lookup.data) return {data: null, since: null, warnings: lookup.warnings};

  const lookupData = lookup.data as ItadLookup;
  const gameId =
    typeof lookupData.game?.id === "string" ? lookupData.game.id.trim() : "";
  if (lookupData.found !== true || !gameId) {
    return {
      data: null,
      since: null,
      warnings: [
        ...lookup.warnings,
        `ITAD has no game mapping for Steam appid ${appid}`,
      ],
    };
  }

  const historyUrl = new URL("/games/history/v2", ITAD_API);
  historyUrl.searchParams.set("key", apiKey);
  historyUrl.searchParams.set("id", gameId);
  historyUrl.searchParams.set("shops", STEAM_SHOP_ID);
  historyUrl.searchParams.set("country", options.country);
  historyUrl.searchParams.set("since", options.since);
  const history = await fetcher(historyUrl, {source: "ITAD price history"});
  if (!history.data) {
    return {
      data: null,
      since: null,
      warnings: [...lookup.warnings, ...history.warnings],
    };
  }

  const normalized = normalizeHistory(history.data);
  const malformedWarning =
    Array.isArray(history.data) && history.data.length > 0 && normalized.length === 0
      ? ["ITAD price history contained no valid entries"]
      : [];
  return {
    data: normalized,
    since: options.since,
    warnings: [...lookup.warnings, ...history.warnings, ...malformedWarning],
  };
}

export function createTimelineFetcher(
  dependencies: TimelineDependencies = {},
): (appid: number, opts?: TimelineOptions) => Promise<FetchResult<Timeline>> {
  const now = dependencies.now ?? (() => new Date());
  const fetcher = dependencies.fetcher
    ?? ((url, opts) => fetchJson<unknown>(url, opts));

  return async (appid: number, opts: TimelineOptions = {}) => {
    requireAppid(appid);
    const observedAt = now();
    if (Number.isNaN(observedAt.getTime())) throw new TypeError("now must be valid");
    const options = resolveTimelineOptions(opts, observedAt);
    const apiKey = (dependencies.apiKey ?? process.env.ITAD_API_KEY ?? "").trim();

    const spyUrl = new URL(STEAMSPY_API);
    spyUrl.searchParams.set("request", "appdetails");
    spyUrl.searchParams.set("appid", String(appid));
    const spyPromise = fetcher(spyUrl, {source: "steamspy timeline"});

    const historyPromise: Promise<PriceHistoryResult> = apiKey
      ? fetchItadHistory(appid, options, apiKey, fetcher)
      : Promise.resolve({
          data: null,
          since: null,
          warnings: [
            "ITAD price history disabled: create an API key at https://isthereanydeal.com/apps/my/ and set ITAD_API_KEY",
          ],
        });

    const [rawSpy, history] = await Promise.all([spyPromise, historyPromise]);
    const spy = rawSpy as FetchResult<RawSteamSpy>;
    return normalizeTimelineSnapshot(observedAt, options.country, spy, history);
  };
}

export const fetchTimeline = createTimelineFetcher();
