import {fetchJson, type FetchResult} from "./http.js";
import {strictFiniteNumber} from "./normalize.js";

const STORE_API = "https://store.steampowered.com/api";
const STEAMSPY_API = "https://steamspy.com/api.php";

export type StoreRegion = "us" | "jp" | "eu";

const REGION_COUNTRY = {
  us: "us",
  jp: "jp",
  eu: "de",
} as const satisfies Record<StoreRegion, "us" | "jp" | "de">;

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

export interface GameProfile {
  appid: number;
  name: string;
  shortDescription: string;
  releaseDate: string;
  isFree: boolean;
  tags: string[];
  genres: string[];
  languages: string[];
  prices: Record<StoreRegion, RegionPrice | null>;
  reviewStats: {
    positive: number;
    negative: number;
    positivePercent: number;
  } | null;
  ccu: number | null;
  owners: string | null;
  screenshots: string[];
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
  supported_languages?: unknown;
  price_overview?: StorePriceOverview;
  release_date?: {date?: unknown};
  genres?: Array<{description?: unknown}>;
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function uniqueWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
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
    ? us.genres.map((genre) => stringValue(genre.description)).filter(Boolean)
    : [];
  const screenshots = Array.isArray(us.screenshots)
    ? us.screenshots.map((shot) => stringValue(shot.path_full)).filter(Boolean)
    : [];

  return {
    data: {
      appid,
      name: stringValue(us.name),
      shortDescription: stringValue(us.short_description),
      releaseDate: stringValue(us.release_date?.date),
      isFree,
      tags: spyTags ? Object.keys(spyTags) : [],
      genres,
      languages: parseSupportedLanguages(us.supported_languages),
      prices,
      reviewStats,
      ccu: ccu !== null && ccu >= 0 ? ccu : null,
      owners,
      screenshots,
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

export async function searchGames(query: string): Promise<FetchResult<SearchHit[]>> {
  const term = query.trim();
  if (!term) throw new TypeError("query must not be empty");

  const result = await fetchJson<{items?: Array<{id?: unknown; name?: unknown}>}>(
    storeUrl("storesearch/", {term, cc: "us", l: "english"}),
    {source: "steam store search"},
  );

  if (!result.data) return {data: null, warnings: result.warnings};
  const hits = (result.data.items ?? []).flatMap((item) => {
    const id = strictFiniteNumber(item.id);
    const name = stringValue(item.name);
    return id !== null && Number.isInteger(id) && id > 0 && name
      ? [{appid: id, name}]
      : [];
  });
  return {data: hits, warnings: result.warnings};
}

export async function fetchGame(appid: number): Promise<FetchResult<GameProfile>> {
  requireAppid(appid);

  const regionRequests = (Object.entries(REGION_COUNTRY) as Array<
    [StoreRegion, "us" | "jp" | "de"]
  >).map(async ([region, country]) => {
    const result = await fetchJson<StoreEnvelope>(
      storeUrl("appdetails", {
        appids: String(appid),
        cc: country,
        l: "english",
      }),
      {source: `steam store ${region}`},
    );
    return [region, result] as const;
  });

  const spyUrl = new URL(STEAMSPY_API);
  spyUrl.searchParams.set("request", "appdetails");
  spyUrl.searchParams.set("appid", String(appid));

  const [regions, spy] = await Promise.all([
    Promise.all(regionRequests),
    fetchJson<SteamSpyData>(spyUrl, {source: "steamspy"}),
  ]);

  return normalizeGameProfile(
    appid,
    Object.fromEntries(regions) as StoreRegionResults,
    spy,
  );
}
