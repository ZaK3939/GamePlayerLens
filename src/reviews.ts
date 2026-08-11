import {fetchJson, type FetchMeta, type FetchResult} from "./http.js";
import {strictFiniteNumber} from "./normalize.js";

const REVIEWS_API = "https://store.steampowered.com/appreviews";
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const MAX_RAW_REVIEWS = 300;

export interface Review {
  recommendationId: string;
  review: string;
  votedUp: boolean;
  playtimeHours: number;
  language: string;
  timestamp: number;
}

export interface ReviewOptions {
  language?: string;
  type?: "all" | "positive" | "negative";
  minPlaytimeHours?: number;
  limit?: number;
}

export interface RawReview {
  recommendationid?: unknown;
  review?: unknown;
  voted_up?: unknown;
  language?: unknown;
  timestamp_created?: unknown;
  author?: {playtime_forever?: unknown};
}

interface ReviewsResponse {
  success?: unknown;
  reviews?: RawReview[];
  cursor?: unknown;
}

interface NormalizedOptions {
  language: string;
  type: "all" | "positive" | "negative";
  minPlaytimeHours: number;
  limit: number;
}

type ReviewsJsonFetcher = (
  url: string | URL,
  opts?: {timeoutMs?: number; source?: string},
) => Promise<FetchResult<unknown>>;

export interface ReviewsFetcherDependencies {
  now?: () => Date;
  fetcher?: ReviewsJsonFetcher;
}

function normalizeOptions(opts: ReviewOptions = {}): NormalizedOptions {
  const language = (opts.language ?? "all").trim().toLowerCase();
  if (!language || !/^[a-z0-9_-]+$/i.test(language)) {
    throw new TypeError("language must be a non-empty Steam language code");
  }

  const type = opts.type ?? "all";
  if (!(["all", "positive", "negative"] as const).includes(type)) {
    throw new TypeError("type must be all, positive, or negative");
  }

  const minPlaytimeHours = opts.minPlaytimeHours ?? 0;
  if (!Number.isFinite(minPlaytimeHours) || minPlaytimeHours < 0) {
    throw new TypeError("minPlaytimeHours must be a non-negative number");
  }

  const limit = opts.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RAW_REVIEWS) {
    throw new TypeError("limit must be an integer from 1 to 300");
  }

  return {language, type, minPlaytimeHours, limit};
}

function matchesType(votedUp: boolean, type: NormalizedOptions["type"]): boolean {
  return type === "all" || (type === "positive" ? votedUp : !votedUp);
}

export function sanitizeReviewText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\?{3,}/g, "")
    .trim();
}

function normalizeReview(raw: RawReview): Review | null {
  const recommendationId =
    typeof raw.recommendationid === "string" ? raw.recommendationid.trim() : "";
  const language = typeof raw.language === "string" ? raw.language.trim() : "";
  const playtimeMinutes = strictFiniteNumber(raw.author?.playtime_forever);
  const timestamp = strictFiniteNumber(raw.timestamp_created);
  if (
    !recommendationId
    || !language
    || typeof raw.voted_up !== "boolean"
    || playtimeMinutes === null
    || playtimeMinutes < 0
    || timestamp === null
    || !Number.isInteger(timestamp)
    || timestamp < 0
  ) {
    return null;
  }

  return {
    recommendationId,
    review: sanitizeReviewText(raw.review),
    votedUp: raw.voted_up,
    playtimeHours: Math.round((playtimeMinutes / 60) * 10) / 10,
    language,
    timestamp,
  };
}

export function normalizeReviewPages(
  pages: RawReview[][],
  opts: ReviewOptions = {},
): FetchResult<Review[]> {
  const options = normalizeOptions(opts);
  const rawReviews = pages.slice(0, MAX_PAGES).flat().slice(0, MAX_RAW_REVIEWS);
  const seen = new Set<string>();
  const reviews: Review[] = [];

  for (const raw of rawReviews) {
    const review = normalizeReview(raw);
    if (!review || seen.has(review.recommendationId)) continue;
    seen.add(review.recommendationId);

    if (options.language !== "all" && review.language !== options.language) continue;
    if (!matchesType(review.votedUp, options.type)) continue;
    if (review.playtimeHours < options.minPlaytimeHours) continue;
    reviews.push(review);
    if (reviews.length === options.limit) break;
  }

  const warnings = reviews.length < options.limit
    ? [
        `steam reviews returned ${reviews.length} of requested ${options.limit} after filters (scanned ${rawReviews.length})`,
      ]
    : [];
  return {data: reviews, warnings};
}

function requireAppid(appid: number): void {
  if (!Number.isInteger(appid) || appid <= 0) {
    throw new TypeError("appid must be a positive integer");
  }
}

function reviewUrl(
  appid: number,
  cursor: string,
  options: NormalizedOptions,
): URL {
  const url = new URL(`${REVIEWS_API}/${appid}`);
  url.searchParams.set("json", "1");
  url.searchParams.set("filter", "recent");
  url.searchParams.set("language", options.language);
  url.searchParams.set("review_type", options.type);
  url.searchParams.set("purchase_type", "all");
  url.searchParams.set("num_per_page", String(PAGE_SIZE));
  url.searchParams.set("cursor", cursor);
  return url;
}

function reviewMeta(
  observedAt: string,
  options: NormalizedOptions,
  scannedRawCount: number,
  pagesScanned: number,
): FetchMeta {
  return {
    observedAt,
    sources: [{
      name: "Steam Store",
      homepage: "https://store.steampowered.com/",
      notes: "Recent user reviews returned by the Steam Store reviews endpoint.",
    }],
    request: {...options},
    methodology: {
      selection: "recent-first",
      scannedRawCount,
      pagesScanned,
      deduplication: "recommendationId",
      filtersAppliedBeforeLimit: true,
    },
  };
}

export function createReviewsFetcher(
  dependencies: ReviewsFetcherDependencies = {},
): (appid: number, opts?: ReviewOptions) => Promise<FetchResult<Review[]>> {
  const now = dependencies.now ?? (() => new Date());
  const fetcher = dependencies.fetcher
    ?? ((url, opts) => fetchJson<unknown>(url, opts));

  return async (appid: number, opts: ReviewOptions = {}) => {
    requireAppid(appid);
    const options = normalizeOptions(opts);
    const observed = now();
    if (Number.isNaN(observed.getTime())) throw new TypeError("now must be valid");
    const observedAt = observed.toISOString();
    const pages: RawReview[][] = [];
    const warnings: string[] = [];
    let cursor = "*";
    let scanned = 0;

    for (let page = 0; page < MAX_PAGES && scanned < MAX_RAW_REVIEWS; page += 1) {
      const result = await fetcher(
        reviewUrl(appid, cursor, options),
        {source: "steam reviews"},
      ) as FetchResult<ReviewsResponse>;
      warnings.push(...result.warnings);
      if (!result.data) {
        if (pages.length === 0) {
          return {
            data: null,
            warnings,
            meta: reviewMeta(observedAt, options, scanned, pages.length),
          };
        }
        break;
      }
      if (result.data.success !== 1) {
        warnings.push("steam reviews API rejected request");
        if (pages.length === 0) {
          return {
            data: null,
            warnings,
            meta: reviewMeta(observedAt, options, scanned, pages.length),
          };
        }
        break;
      }

      const remaining = MAX_RAW_REVIEWS - scanned;
      const rawPage = Array.isArray(result.data.reviews)
        ? result.data.reviews.slice(0, remaining)
        : [];
      pages.push(rawPage);
      scanned += rawPage.length;

      const normalized = normalizeReviewPages(pages, options);
      if ((normalized.data?.length ?? 0) >= options.limit) break;

      const nextCursor =
        typeof result.data.cursor === "string" ? result.data.cursor : "";
      if (!rawPage.length || !nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }

    const normalized = normalizeReviewPages(pages, options);
    return {
      data: normalized.data,
      warnings: [...warnings, ...normalized.warnings],
      meta: reviewMeta(observedAt, options, scanned, pages.length),
    };
  };
}

export const fetchReviews = createReviewsFetcher();
