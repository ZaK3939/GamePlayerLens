import {fetchJson, type FetchMeta, type FetchResult} from "./http.js";
import {strictFiniteNumber} from "./normalize.js";

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

interface NormalizedHistory {
  points: PriceHistoryPoint[];
  invalidCount: number;
}

type AveragePlaytimeStatus =
  | "reported"
  | "reported-zero-treated-as-missing"
  | "missing-or-invalid";

type TimelineJsonFetcher = (
  url: string | URL,
  opts?: {timeoutMs?: number; source?: string},
) => Promise<FetchResult<unknown>>;

export interface TimelineDependencies {
  apiKey?: string;
  now?: () => Date;
  fetcher?: TimelineJsonFetcher;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHistory(data: unknown[]): NormalizedHistory {
  const points: PriceHistoryPoint[] = [];
  let invalidCount = 0;
  for (const value of data) {
    if (!isRecord(value)) {
      invalidCount += 1;
      continue;
    }
    const raw = value as RawHistoryPoint;
    const date = typeof raw.timestamp === "string" ? raw.timestamp.trim() : "";
    const amount = strictFiniteNumber(raw.deal?.price?.amount);
    const currency =
      typeof raw.deal?.price?.currency === "string"
        ? raw.deal.price.currency.trim()
        : "";
    const discountPercent = strictFiniteNumber(raw.deal?.cut);
    if (
      !date
      || Number.isNaN(Date.parse(date))
      || amount === null
      || amount < 0
      || !currency
      || discountPercent === null
      || discountPercent < 0
      || discountPercent > 100
    ) {
      invalidCount += 1;
      continue;
    }
    points.push({date, amount, currency, discountPercent});
  }
  return {points, invalidCount};
}

export function normalizeTimelineSnapshot(
  observedAt: Date,
  country: string,
  spyResult: FetchResult<RawSteamSpy>,
  historyResult: PriceHistoryResult,
): FetchResult<Timeline> {
  const ccu = strictFiniteNumber(spyResult.data?.ccu);
  const averageMinutes = strictFiniteNumber(spyResult.data?.average_forever);
  const owners = typeof spyResult.data?.owners === "string"
    && spyResult.data.owners.trim() !== ""
    ? spyResult.data.owners
    : null;
  const spyRecognized = (ccu !== null && ccu >= 0)
    || (averageMinutes !== null && averageMinutes >= 0)
    || owners !== null;
  const spyWarnings = spyResult.data !== null && !spyRecognized
    ? ["steamspy timeline returned an invalid response"]
    : [];
  const reportedZeroWarnings = averageMinutes === 0
    ? ["steamspy average playtime reported zero; treated as missing"]
    : [];
  return {
    data: {
      observedAt: observedAt.toISOString(),
      currentCcu: ccu !== null && ccu >= 0 ? ccu : null,
      owners,
      avgPlaytimeHours:
        averageMinutes !== null && averageMinutes > 0
          ? Math.round((averageMinutes / 60) * 10) / 10
          : null,
      priceHistory: historyResult.data,
      priceHistorySince: historyResult.since,
      country,
    },
    warnings: [
      ...spyResult.warnings,
      ...spyWarnings,
      ...reportedZeroWarnings,
      ...historyResult.warnings,
    ],
  };
}

function averagePlaytimeStatus(data: RawSteamSpy | null): AveragePlaytimeStatus {
  const averageMinutes = strictFiniteNumber(data?.average_forever);
  if (averageMinutes === 0) return "reported-zero-treated-as-missing";
  return averageMinutes !== null && averageMinutes > 0
    ? "reported"
    : "missing-or-invalid";
}

function timelineMeta(
  observedAt: string,
  options: ResolvedTimelineOptions,
  itadAvailable: boolean,
  playtimeStatus: AveragePlaytimeStatus,
): FetchMeta {
  return {
    observedAt,
    sources: [
      {
        name: "SteamSpy",
        homepage: "https://steamspy.com/about",
        notes: "SteamSpy values are estimates; owners are ownership estimates, not sales. Recent releases or small samples can be unreliable.",
      },
      {
        name: "IsThereAnyDeal",
        homepage: "https://isthereanydeal.com/",
        notes: itadAvailable
          ? "Steam shop price history requested."
          : "Price history unavailable because ITAD_API_KEY is not configured.",
      },
    ],
    request: {country: options.country, since: options.since},
    methodology: {
      itadAvailable,
      itadAvailability: itadAvailable ? "configured" : "disabled-no-api-key",
      averagePlaytimeStatus: playtimeStatus,
      ccuStatus: "current-snapshot",
    },
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
  if (lookup.data === null) return {data: null, since: null, warnings: lookup.warnings};

  if (!isRecord(lookup.data)) {
    return {
      data: null,
      since: null,
      warnings: [...lookup.warnings, "ITAD lookup returned an invalid response"],
    };
  }
  const lookupData = lookup.data as ItadLookup;
  const gameId =
    typeof lookupData.game?.id === "string" ? lookupData.game.id.trim() : "";
  if (lookupData.found === false) {
    return {
      data: null,
      since: null,
      warnings: [
        ...lookup.warnings,
        `ITAD has no game mapping for Steam appid ${appid}`,
      ],
    };
  }
  if (lookupData.found !== true || !gameId) {
    return {
      data: null,
      since: null,
      warnings: [...lookup.warnings, "ITAD lookup returned an invalid response"],
    };
  }

  const historyUrl = new URL("/games/history/v2", ITAD_API);
  historyUrl.searchParams.set("key", apiKey);
  historyUrl.searchParams.set("id", gameId);
  historyUrl.searchParams.set("shops", STEAM_SHOP_ID);
  historyUrl.searchParams.set("country", options.country);
  historyUrl.searchParams.set("since", options.since);
  const history = await fetcher(historyUrl, {source: "ITAD price history"});
  if (history.data === null) {
    return {
      data: null,
      since: null,
      warnings: [...lookup.warnings, ...history.warnings],
    };
  }

  if (!Array.isArray(history.data)) {
    return {
      data: null,
      since: null,
      warnings: [
        ...lookup.warnings,
        ...history.warnings,
        "ITAD price history returned an invalid response",
      ],
    };
  }
  const normalized = normalizeHistory(history.data);
  if (history.data.length > 0 && normalized.points.length === 0) {
    return {
      data: null,
      since: null,
      warnings: [
        ...lookup.warnings,
        ...history.warnings,
        "ITAD price history contained no valid entries",
      ],
    };
  }
  const malformedWarning = normalized.invalidCount > 0
    ? [`ITAD price history skipped ${normalized.invalidCount} invalid entries`]
    : [];
  return {
    data: normalized.points,
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
    const normalized = normalizeTimelineSnapshot(
      observedAt,
      options.country,
      spy,
      history,
    );
    return {
      ...normalized,
      meta: timelineMeta(
        observedAt.toISOString(),
        options,
        apiKey !== "",
        averagePlaytimeStatus(spy.data),
      ),
    };
  };
}

export const fetchTimeline = createTimelineFetcher();
