import {fetchJson, type FetchMeta, type FetchResult} from "./http.js";
import {strictFiniteNumber} from "./normalize.js";

const STORE_API = "https://store.steampowered.com/api";
const STEAMSPY_API = "https://steamspy.com/api.php";
const STEAM_STORE_SOURCE = {
  name: "Steam Store",
  homepage: "https://store.steampowered.com/",
} as const;
const STEAMSPY_SOURCE = {
  name: "SteamSpy",
  homepage: "https://steamspy.com/about",
  notes: "SteamSpy values are estimates; owners are ownership estimates, not sales. Recent releases or small samples can be unreliable.",
} as const;

export type StoreRegion = "us" | "jp" | "eu";
export type StorefrontLanguage = "english" | "japanese" | "german";

const REGION_COUNTRY = {
  us: "us",
  jp: "jp",
  eu: "de",
} as const satisfies Record<StoreRegion, "us" | "jp" | "de">;

const REGION_LANGUAGE = {
  us: "english",
  jp: "japanese",
  eu: "german",
} as const satisfies Record<StoreRegion, StorefrontLanguage>;

const STOREFRONT_TEXT_MAX_LENGTH = 12_000;

export interface SearchHit {
  appid: number;
  name: string;
}

export interface RegionPrice {
  countryCode: "us" | "jp" | "de";
  currency: string;
  finalFormatted: string;
  discountPercent: number;
}

export interface LocalizedStorefront {
  countryCode: "us" | "jp" | "de";
  requestedLanguage: StorefrontLanguage;
  shortDescription: string;
  aboutTheGame: string;
  aboutTheGameTruncated: boolean;
}

export interface GameProfile {
  appid: number;
  name: string;
  shortDescription: string;
  releaseDate: string;
  isFree: boolean;
  tags: string[];
  genres: string[];
  categories: string[];
  languages: string[];
  localizedStorefronts: Record<StorefrontLanguage, LocalizedStorefront | null>;
  prices: Record<StoreRegion, RegionPrice | null>;
  reviewStats: {
    positive: number;
    negative: number;
    positivePercent: number;
  } | null;
  ccu: number | null;
  owners: string | null;
  screenshots: string[];
  referenceLinks: {
    steamStore: string;
    steamSonar: string;
    steamDb: string;
  };
}

interface StorePriceOverview {
  currency?: unknown;
  final_formatted?: unknown;
  discount_percent?: unknown;
}

interface StoreGameData {
  name?: unknown;
  steam_appid?: unknown;
  is_free?: unknown;
  short_description?: unknown;
  about_the_game?: unknown;
  supported_languages?: unknown;
  price_overview?: StorePriceOverview;
  release_date?: {date?: unknown};
  genres?: Array<{description?: unknown}>;
  categories?: Array<{description?: unknown}>;
  screenshots?: Array<{path_full?: unknown}>;
}

interface StoreEnvelopeEntry {
  success?: boolean;
  data?: StoreGameData;
}

type StoreEnvelope = Record<string, StoreEnvelopeEntry>;

interface SteamSpyData {
  appid?: unknown;
  owners?: unknown;
  ccu?: unknown;
  positive?: unknown;
  negative?: unknown;
  tags?: Record<string, unknown>;
}

export type StoreRegionResults = Record<
  StoreRegion,
  FetchResult<StoreEnvelope>
>;

type SteamJsonFetcher = (
  url: string | URL,
  opts?: {timeoutMs?: number; source?: string},
) => Promise<FetchResult<unknown>>;

export interface SteamFetcherDependencies {
  now?: () => Date;
  fetcher?: SteamJsonFetcher;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, token: string) => {
    if (!token.startsWith("#")) return named[token.toLowerCase()] ?? entity;
    const numeric = token[1]?.toLowerCase() === "x"
      ? Number.parseInt(token.slice(2), 16)
      : Number.parseInt(token.slice(1), 10);
    try {
      return Number.isInteger(numeric) && numeric >= 0
        ? String.fromCodePoint(numeric)
        : entity;
    } catch {
      return entity;
    }
  });
}

function normalizeStorefrontText(value: unknown): {text: string; truncated: boolean} {
  if (typeof value !== "string") return {text: "", truncated: false};
  const normalized = decodeHtmlEntities(value
    .replace(/<(?:script|style)(?:\s[^>]*)?>[\s\S]*?<\/(?:script|style)>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<li(?:\s[^>]*)?>/gi, "\n• ")
    .replace(/<\/(?:div|h[1-6]|li|p)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= STOREFRONT_TEXT_MAX_LENGTH) {
    return {text: normalized, truncated: false};
  }
  return {
    text: `${normalized.slice(0, STOREFRONT_TEXT_MAX_LENGTH - 1).trimEnd()}…`,
    truncated: true,
  };
}

function normalizeLocalizedStorefront(
  region: StoreRegion,
  data: StoreGameData | null,
): LocalizedStorefront | null {
  if (!data) return null;
  const shortDescription = normalizeStorefrontText(data.short_description);
  const aboutTheGame = normalizeStorefrontText(data.about_the_game);
  return {
    countryCode: REGION_COUNTRY[region],
    requestedLanguage: REGION_LANGUAGE[region],
    shortDescription: shortDescription.text,
    aboutTheGame: aboutTheGame.text,
    aboutTheGameTruncated: aboutTheGame.truncated,
  };
}

function storeData(
  result: FetchResult<StoreEnvelope>,
  appid: number,
): StoreGameData | null {
  const entry = result.data?.[String(appid)];
  return entry?.success === true && entry.data ? entry.data : null;
}

export function parseSupportedLanguages(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .replace(/<br\s*\/?>(?:.|\n)*$/i, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\*/g, "")
    .split(",")
    .map((language) => language.trim())
    .filter(Boolean);
}

function normalizePrice(
  region: StoreRegion,
  data: StoreGameData | null,
  isFree: boolean,
  warnings: string[],
): RegionPrice | null {
  if (!data) {
    uniqueWarning(warnings, `steam store ${region} unavailable`);
    return null;
  }
  if (isFree) return null;

  const raw = data.price_overview;
  const currency = stringValue(raw?.currency);
  const finalFormatted = stringValue(raw?.final_formatted);
  const discountPercent = strictFiniteNumber(raw?.discount_percent);
  if (!currency || !finalFormatted || discountPercent === null) {
    uniqueWarning(warnings, `steam store ${region} price unavailable`);
    return null;
  }

  return {
    countryCode: REGION_COUNTRY[region],
    currency,
    finalFormatted,
    discountPercent,
  };
}

export function normalizeGameProfile(
  appid: number,
  stores: StoreRegionResults,
  spyResult: FetchResult<SteamSpyData>,
): FetchResult<GameProfile> {
  const warnings = [
    ...stores.us.warnings,
    ...stores.jp.warnings,
    ...stores.eu.warnings,
    ...spyResult.warnings,
  ];
  const us = storeData(stores.us, appid);
  if (!us) {
    uniqueWarning(warnings, "steam store us unavailable");
    return {data: null, warnings};
  }

  const jp = storeData(stores.jp, appid);
  const eu = storeData(stores.eu, appid);
  const isFree = us.is_free === true;
  const spy = spyResult.data;
  const spyTags = spy?.tags && typeof spy.tags === "object" && !Array.isArray(spy.tags)
    ? spy.tags
    : null;
  const spyAppid = strictFiniteNumber(spy?.appid);
  const ccu = strictFiniteNumber(spy?.ccu);
  const positive = strictFiniteNumber(spy?.positive);
  const negative = strictFiniteNumber(spy?.negative);
  const owners = typeof spy?.owners === "string" && spy.owners.trim() !== ""
    ? spy.owners
    : null;
  const spyRecognized = Boolean(
    spy
    && (
      (spyAppid !== null && Number.isInteger(spyAppid) && spyAppid > 0)
      || (ccu !== null && ccu >= 0)
      || (positive !== null && positive >= 0)
      || (negative !== null && negative >= 0)
      || owners !== null
      || spyTags !== null
    )
  );
  const prices = {
    us: normalizePrice("us", us, isFree, warnings),
    jp: normalizePrice("jp", jp, isFree, warnings),
    eu: normalizePrice("eu", eu, isFree, warnings),
  };
  if (!spy) uniqueWarning(warnings, "steamspy unavailable");
  else if (!spyRecognized) uniqueWarning(warnings, "steamspy returned an invalid response");

  const reviewTotal = (positive ?? 0) + (negative ?? 0);
  const reviewStats =
    positive !== null
      && positive >= 0
      && negative !== null
      && negative >= 0
      && reviewTotal > 0
      ? {
          positive,
          negative,
          positivePercent: Math.round((positive / reviewTotal) * 100),
        }
      : null;

  const genres = Array.isArray(us.genres)
    ? uniqueStrings(us.genres
        .map((genre) => stringValue(genre.description))
        .filter(Boolean))
    : [];
  const categories = Array.isArray(us.categories)
    ? uniqueStrings(us.categories
        .map((category) => stringValue(category.description))
        .filter(Boolean))
    : [];
  const screenshots = Array.isArray(us.screenshots)
    ? uniqueStrings(us.screenshots
        .map((shot) => stringValue(shot.path_full))
        .filter(Boolean))
    : [];
  const localizedStorefronts = {
    english: normalizeLocalizedStorefront("us", us),
    japanese: normalizeLocalizedStorefront("jp", jp),
    german: normalizeLocalizedStorefront("eu", eu),
  } satisfies Record<StorefrontLanguage, LocalizedStorefront | null>;
  const primaryShortDescription = localizedStorefronts.english?.shortDescription ?? "";

  return {
    data: {
      appid,
      name: stringValue(us.name),
      shortDescription: primaryShortDescription,
      releaseDate: stringValue(us.release_date?.date),
      isFree,
      tags: spyTags ? Object.keys(spyTags) : [],
      genres,
      categories,
      languages: parseSupportedLanguages(us.supported_languages),
      localizedStorefronts,
      prices,
      reviewStats,
      ccu: ccu !== null && ccu >= 0 ? ccu : null,
      owners,
      screenshots,
      referenceLinks: {
        steamStore: `https://store.steampowered.com/app/${appid}/`,
        steamSonar: `https://www.steamsonar.gg/game/${appid}`,
        steamDb: `https://steamdb.info/app/${appid}/`,
      },
    },
    warnings,
  };
}

function requireAppid(appid: number): void {
  if (!Number.isInteger(appid) || appid <= 0) {
    throw new TypeError("appid must be a positive integer");
  }
}

function storeUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(`${STORE_API}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function observedAt(now: () => Date): string {
  const observed = now();
  if (Number.isNaN(observed.getTime())) throw new TypeError("now must be valid");
  return observed.toISOString();
}

function searchMeta(observed: string, query: string): FetchMeta {
  return {
    observedAt: observed,
    sources: [{...STEAM_STORE_SOURCE}],
    request: {query},
    methodology: {selection: "Steam Store search results"},
  };
}

function gameMeta(observed: string): FetchMeta {
  return {
    observedAt: observed,
    sources: [{...STEAM_STORE_SOURCE}, {...STEAMSPY_SOURCE}],
    request: {countries: ["US", "JP", "DE"]},
    methodology: {
      regionalPricing: "Steam Store country snapshots",
      storefrontLanguages: {
        US: "english",
        JP: "japanese",
        DE: "german",
      },
      storefrontFallback: "Steam may return fallback copy when the requested localization is unavailable.",
      storefrontTextLimit: STOREFRONT_TEXT_MAX_LENGTH,
      steamSpyValues: "estimates",
    },
  };
}

export function createSearchGamesFetcher(
  dependencies: SteamFetcherDependencies = {},
): (query: string) => Promise<FetchResult<SearchHit[]>> {
  const now = dependencies.now ?? (() => new Date());
  const fetcher = dependencies.fetcher
    ?? ((url, opts) => fetchJson<unknown>(url, opts));

  return async (query: string) => {
    const term = query.trim();
    if (!term) throw new TypeError("query must not be empty");
    const meta = searchMeta(observedAt(now), term);
    const result = await fetcher(
      storeUrl("storesearch/", {term, cc: "us", l: "english"}),
      {source: "steam store search"},
    ) as FetchResult<{items?: Array<{id?: unknown; name?: unknown}>}>;

    if (!result.data) return {data: null, warnings: result.warnings, meta};
    const hits = (result.data.items ?? []).flatMap((item) => {
      const id = strictFiniteNumber(item.id);
      const name = stringValue(item.name);
      return id !== null && Number.isInteger(id) && id > 0 && name
        ? [{appid: id, name}]
        : [];
    });
    return {data: hits, warnings: result.warnings, meta};
  };
}

export function createGameFetcher(
  dependencies: SteamFetcherDependencies = {},
): (appid: number) => Promise<FetchResult<GameProfile>> {
  const now = dependencies.now ?? (() => new Date());
  const fetcher = dependencies.fetcher
    ?? ((url, opts) => fetchJson<unknown>(url, opts));

  return async (appid: number) => {
    requireAppid(appid);
    const meta = gameMeta(observedAt(now));

    const regionRequests = (Object.entries(REGION_COUNTRY) as Array<
      [StoreRegion, "us" | "jp" | "de"]
    >).map(async ([region, country]) => {
      const result = await fetcher(
        storeUrl("appdetails", {
          appids: String(appid),
          cc: country,
          l: REGION_LANGUAGE[region],
        }),
        {source: `steam store ${region}`},
      ) as FetchResult<StoreEnvelope>;
      return [region, result] as const;
    });

    const spyUrl = new URL(STEAMSPY_API);
    spyUrl.searchParams.set("request", "appdetails");
    spyUrl.searchParams.set("appid", String(appid));

    const [regions, rawSpy] = await Promise.all([
      Promise.all(regionRequests),
      fetcher(spyUrl, {source: "steamspy"}),
    ]);

    const normalized = normalizeGameProfile(
      appid,
      Object.fromEntries(regions) as StoreRegionResults,
      rawSpy as FetchResult<SteamSpyData>,
    );
    return {...normalized, meta};
  };
}

export const searchGames = createSearchGamesFetcher();
export const fetchGame = createGameFetcher();
