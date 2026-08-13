import {z} from "zod";
import type {DiscoveryInput, DiscoveryResult} from "./discovery.js";
import type {FetchMeta, FetchResult, FetchSource, JsonValue} from "./http.js";
import type {Review, ReviewOptions} from "./reviews.js";
import type {GameProfile, StorefrontLanguage} from "./steam.js";
import type {Timeline, TimelineOptions} from "./timeline.js";
import type {SteamUpdateHistory, SteamUpdateOptions} from "./updates.js";

const DEFAULT_REVIEW_LIMIT = 8;
const DEFAULT_UPDATE_LIMIT = 8;
const DEFAULT_COMPETITOR_LIMIT = 5;
const REVIEW_EXCERPT_CHARS = 600;
const UPDATE_SUMMARY_CHARS = 500;
const UPDATE_HIGHLIGHT_CHARS = 240;

export const SteamDeveloperBriefInputSchema = z.object({
  appid: z.number().int().positive(),
  language: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{0,31}$/),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/),
  reviewLimit: z.number().int().min(2).max(20).optional(),
  updateLimit: z.number().int().min(1).max(20).optional(),
  competitorLimit: z.number().int().min(1).max(10).optional(),
}).strict();

export type SteamDeveloperBriefInput = z.input<typeof SteamDeveloperBriefInputSchema>;

interface BriefReview {
  recommendationId: string;
  excerpt: string;
  truncated: boolean;
  votedUp: boolean;
  playtimeHours: number;
  language: string;
  timestamp: number;
}

interface BriefDimension {
  dimension:
    | "store-positioning"
    | "regional-pricing"
    | "localized-copy"
    | "review-friction"
    | "current-indicators"
    | "update-history"
    | "competition-shortlist"
    | "gameplay-experience";
  status: "observed" | "partial" | "missing" | "not-assessed";
  basis: string;
}

interface BriefProvenance {
  sourceTool:
    | "steam_fetch"
    | "steam_reviews:positive"
    | "steam_reviews:negative"
    | "steam_timeline"
    | "steam_updates"
    | "steam_discover";
  status: "observed" | "empty" | "unavailable" | "not-requested";
  observedAt?: string;
  warnings: string[];
}

export interface SteamDeveloperBrief {
  schemaVersion: 1;
  purpose: "first-pass-developer-triage";
  assembledAt: string;
  audience: {language: string; country: string};
  target: null | {
    appid: number;
    name: string;
    releaseDate: string;
    isFree: boolean;
    shortDescription: string;
    tags: string[];
    genres: string[];
    categories: string[];
    languages: string[];
    localizedCopy: null | {
      requestedLanguage: string;
      status: "distinct-from-english" | "matches-english" | "comparison-unavailable";
      shortDescription: string;
    };
    prices: GameProfile["prices"];
    priceHistorySummary: null | {
      country: string;
      since: string | null;
      pointCount: number;
      latest: NonNullable<Timeline["priceHistory"]>[number] | null;
      lowestByCurrency: Array<NonNullable<Timeline["priceHistory"]>[number]>;
    };
    reviewStats: GameProfile["reviewStats"];
    currentCcu: number | null;
    currentCcuSource: "steam_timeline" | "steam_fetch" | null;
    owners: string | null;
    ownersSource: "steam_timeline" | "steam_fetch" | null;
    avgPlaytimeHours: number | null;
    referenceLinks: GameProfile["referenceLinks"];
  };
  evidence: {
    reviews: {
      selection: "recent-first";
      requestedLanguage: string;
      requestedPerPolarity: number;
      positive: BriefReview[];
      negative: BriefReview[];
      limitation: string;
    };
    updates: null | {
      summary: SteamUpdateHistory["summary"];
      recentItems: Array<{
        gid: string;
        title: string;
        url: string;
        publishedAt: string;
        type: string;
        updateEvidence: string;
        updateConfidence: number;
        platformHints: string[];
        summary: string;
        highlights: string[];
      }>;
    };
    competition: {
      selection: null | {kind: "tag" | "genre"; value: string};
      candidates: DiscoveryResult["candidates"];
      limitation: string;
    };
  };
  readiness: {
    status: "ready" | "partial" | "blocked";
    dimensions: BriefDimension[];
    supportedDecisions: string[];
    unsupportedClaims: string[];
    gaps: string[];
    nextActions: string[];
  };
  provenance: BriefProvenance[];
}

export interface DeveloperBriefDependencies {
  clock?: () => Date;
  fetchGame(appid: number): Promise<FetchResult<GameProfile>>;
  fetchReviews(appid: number, options?: ReviewOptions): Promise<FetchResult<Review[]>>;
  fetchTimeline(appid: number, options?: TimelineOptions): Promise<FetchResult<Timeline>>;
  fetchUpdates(
    appid: number,
    options?: SteamUpdateOptions,
  ): Promise<FetchResult<SteamUpdateHistory>>;
  discoverGames(input: DiscoveryInput): Promise<FetchResult<DiscoveryResult>>;
}

function truncate(value: string, maximum: number): {text: string; truncated: boolean} {
  if (value.length <= maximum) return {text: value, truncated: false};
  const end = maximum - 1;
  const high = value.charCodeAt(end - 1);
  const low = value.charCodeAt(end);
  const safeEnd = high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF
    ? end - 1
    : end;
  return {text: `${value.slice(0, safeEnd).trimEnd()}…`, truncated: true};
}

function briefReview(review: Review): BriefReview {
  const excerpt = truncate(review.review, REVIEW_EXCERPT_CHARS);
  return {
    recommendationId: review.recommendationId,
    excerpt: excerpt.text,
    truncated: excerpt.truncated,
    votedUp: review.votedUp,
    playtimeHours: review.playtimeHours,
    language: review.language,
    timestamp: review.timestamp,
  };
}

function summarizePriceHistory(
  timeline: Timeline | null,
): NonNullable<SteamDeveloperBrief["target"]>["priceHistorySummary"] {
  if (!timeline || timeline.priceHistory === null) return null;
  let latest: NonNullable<Timeline["priceHistory"]>[number] | null = null;
  const lowestByCurrency = new Map<
    string,
    NonNullable<Timeline["priceHistory"]>[number]
  >();
  for (const point of timeline.priceHistory) {
    if (!latest || Date.parse(point.date) > Date.parse(latest.date)) latest = point;
    const lowest = lowestByCurrency.get(point.currency);
    if (!lowest || point.amount < lowest.amount) lowestByCurrency.set(point.currency, point);
  }
  return {
    country: timeline.country,
    since: timeline.priceHistorySince,
    pointCount: timeline.priceHistory.length,
    latest,
    lowestByCurrency: [...lowestByCurrency.values()],
  };
}

function requestedStorefront(
  profile: GameProfile,
  language: string,
): NonNullable<SteamDeveloperBrief["target"]>["localizedCopy"] {
  if (!(language === "english" || language === "japanese" || language === "german")) {
    return null;
  }
  const storefront = profile.localizedStorefronts[language as StorefrontLanguage];
  if (!storefront) return null;
  return {
    requestedLanguage: language,
    status: storefront.matchesEnglishCopy === true
      ? "matches-english"
      : storefront.matchesEnglishCopy === false
        ? "distinct-from-english"
        : "comparison-unavailable",
    shortDescription: storefront.shortDescription,
  };
}

function resultStatus<T>(result: FetchResult<T>): BriefProvenance["status"] {
  if (result.data === null) return "unavailable";
  if (Array.isArray(result.data) && result.data.length === 0) return "empty";
  return "observed";
}

function provenance<T>(
  sourceTool: BriefProvenance["sourceTool"],
  result: FetchResult<T>,
  status = resultStatus(result),
): BriefProvenance {
  return {
    sourceTool,
    status,
    ...(result.meta?.observedAt ? {observedAt: result.meta.observedAt} : {}),
    warnings: result.warnings,
  };
}

function prefixWarnings(label: string, warnings: string[]): string[] {
  return warnings.map((warning) => `${label}: ${warning}`);
}

async function safeDependency<T>(
  operation: () => Promise<FetchResult<T>>,
): Promise<FetchResult<T>> {
  try {
    return await operation();
  } catch {
    return {data: null, warnings: ["unexpected dependency failure"]};
  }
}

function uniqueSources(results: Array<FetchResult<unknown>>): FetchSource[] {
  const sources = results.flatMap((result) => result.meta?.sources ?? []);
  return [...new Map(sources.map((source) => [
    `${source.name}\u0000${source.homepage ?? ""}\u0000${source.notes ?? ""}`,
    source,
  ])).values()];
}

function dimensions(
  profile: GameProfile | null,
  timeline: Timeline | null,
  positive: Review[],
  negative: Review[],
  updates: SteamUpdateHistory | null,
  competitors: DiscoveryResult["candidates"],
  language: string,
): BriefDimension[] {
  const localized = profile ? requestedStorefront(profile, language) : null;
  const priceCount = profile
    ? Object.values(profile.prices).filter((price) => price !== null).length
    : 0;
  const localizedStatus = !profile
    ? "missing" as const
    : !localized
      ? "partial" as const
      : language === "english" || localized.status === "distinct-from-english"
        ? "observed" as const
        : "partial" as const;
  const indicatorCount = timeline
    ? [timeline.currentCcu, timeline.owners, timeline.avgPlaytimeHours]
      .filter((value) => value !== null).length
    : 0;
  return [
    {
      dimension: "store-positioning",
      status: profile ? "observed" : "missing",
      basis: profile
        ? "Steam Store description, taxonomy, and reference links are available."
        : "Steam Store profile is unavailable.",
    },
    {
      dimension: "regional-pricing",
      status: !profile ? "missing" : profile.isFree || priceCount === 3 ? "observed" : "partial",
      basis: profile?.isFree
        ? "Steam Store reports the game as free."
        : `${priceCount} of 3 regional Steam price snapshots are available.`,
    },
    {
      dimension: "localized-copy",
      status: localizedStatus,
      basis: localized
        ? `Requested ${language} storefront copy is available; exact English-copy comparison is ${localized.status}.`
        : `Requested ${language} copy is not part of the US/JP/DE storefront snapshot.`,
    },
    {
      dimension: "review-friction",
      status: positive.length > 0 && negative.length > 0
        ? "observed"
        : positive.length > 0 || negative.length > 0
          ? "partial"
          : "missing",
      basis: `${positive.length} positive and ${negative.length} negative recent ${language} reviews are included.`,
    },
    {
      dimension: "current-indicators",
      status: !timeline || indicatorCount === 0
        ? "missing"
        : indicatorCount === 3 ? "observed" : "partial",
      basis: !timeline
        ? "SteamSpy current indicators are unavailable."
        : `${[
          timeline.currentCcu !== null ? "CCU" : null,
          timeline.owners !== null ? "owner estimate" : null,
          timeline.avgPlaytimeHours !== null ? "average playtime" : null,
        ].filter(Boolean).join(", ") || "No current indicator"} available from the current snapshot.`,
    },
    {
      dimension: "update-history",
      status: updates?.items.length ? "observed" : updates ? "partial" : "missing",
      basis: updates
        ? `${updates.items.length} classified update items are included.`
        : "Official Steam update history is unavailable.",
    },
    {
      dimension: "competition-shortlist",
      status: competitors.length > 0 ? "observed" : "missing",
      basis: `${competitors.length} SteamSpy tag candidates are included; this is not a market ranking.`,
    },
    {
      dimension: "gameplay-experience",
      status: "not-assessed",
      basis: "Store, review, and market metadata do not replace direct build operation or a playtest recording.",
    },
  ];
}

function supportedDecisions(items: BriefDimension[]): string[] {
  const mapping: Partial<Record<BriefDimension["dimension"], string>> = {
    "store-positioning": "store-positioning-review",
    "regional-pricing": "regional-price-comparison",
    "localized-copy": "localized-copy-review",
    "review-friction": "review-friction-hypotheses",
    "current-indicators": "current-activity-context",
    "update-history": "update-strategy-review",
    "competition-shortlist": "competitor-shortlist",
  };
  return items.flatMap((item) => item.status === "observed" && mapping[item.dimension]
    ? [mapping[item.dimension]!]
    : []);
}

function nextActions(items: BriefDimension[], language: string): string[] {
  const missing = new Map(items.map((item) => [item.dimension, item.status]));
  const actions: string[] = [];
  if (missing.get("store-positioning") === "missing") {
    actions.push("Verify the appid and retry steam_fetch before making a product recommendation.");
  }
  if (missing.get("regional-pricing") !== "observed") {
    actions.push("Inspect the missing Steam regions with steam_fetch before comparing regional prices.");
  }
  if (missing.get("review-friction") !== "observed") {
    actions.push(`Use steam_reviews to inspect the missing ${language} polarity or widen the declared audience.`);
  }
  if (missing.get("current-indicators") !== "observed") {
    actions.push("Retry steam_timeline before using current activity or ownership context.");
  }
  if (missing.get("update-history") !== "observed") {
    actions.push("Inspect steam_updates warnings or use official-announcement scope before reviewing update strategy.");
  }
  if (missing.get("competition-shortlist") !== "observed") {
    actions.push("Choose a verified SteamSpy tag and run steam_discover; an empty shortlist is not evidence of no competition.");
  }
  if (missing.get("localized-copy") !== "observed") {
    actions.push(`Provide the actual ${language} store copy or capture for localization review.`);
  }
  actions.push("Use derive_personas for a full traceable persona cohort; brief review excerpts are triage evidence only.");
  actions.push("Use run-sim with a playable build, recording, or session log before making gameplay-quality claims.");
  return actions;
}

export function createDeveloperBriefFetcher(
  dependencies: DeveloperBriefDependencies,
): (input: SteamDeveloperBriefInput) => Promise<FetchResult<SteamDeveloperBrief>> {
  const clock = dependencies.clock ?? (() => new Date());
  return async (input) => {
    const parsed = SteamDeveloperBriefInputSchema.parse(input);
    const assembled = clock();
    if (Number.isNaN(assembled.getTime())) throw new TypeError("brief clock must be valid");
    const language = parsed.language;
    const country = parsed.country.toUpperCase();
    const reviewLimit = parsed.reviewLimit ?? DEFAULT_REVIEW_LIMIT;
    const updateLimit = parsed.updateLimit ?? DEFAULT_UPDATE_LIMIT;
    const competitorLimit = parsed.competitorLimit ?? DEFAULT_COMPETITOR_LIMIT;

    const [profileResult, positiveResult, negativeResult, timelineResult, updatesResult] =
      await Promise.all([
        safeDependency(() => dependencies.fetchGame(parsed.appid)),
        safeDependency(() => dependencies.fetchReviews(parsed.appid, {
          language,
          type: "positive",
          limit: reviewLimit,
        })),
        safeDependency(() => dependencies.fetchReviews(parsed.appid, {
          language,
          type: "negative",
          limit: reviewLimit,
        })),
        safeDependency(() => dependencies.fetchTimeline(parsed.appid, {country})),
        safeDependency(() => dependencies.fetchUpdates(parsed.appid, {
          scope: "updates",
          limit: updateLimit,
          contentChars: 600,
        })),
      ]);

    const selection = profileResult.data?.tags[0]
      ? {kind: "tag" as const, value: profileResult.data.tags[0]}
      : profileResult.data?.genres[0]
        ? {kind: "genre" as const, value: profileResult.data.genres[0]}
        : null;
    const discoveryResult = selection
      ? await safeDependency(() => dependencies.discoverGames({
        kind: selection.kind,
        value: selection.value,
        excludeAppids: [parsed.appid],
        limit: competitorLimit,
      }))
      : {
        data: null,
        warnings: ["target profile has no SteamSpy tag for automatic competitor discovery"],
      } satisfies FetchResult<DiscoveryResult>;

    const profile = profileResult.data;
    const positive = positiveResult.data ?? [];
    const negative = negativeResult.data ?? [];
    const timeline = timelineResult.data;
    const updates = updatesResult.data;
    const competitors = discoveryResult.data?.candidates ?? [];
    const coverage = dimensions(
      profile,
      timeline,
      positive,
      negative,
      updates,
      competitors,
      language,
    );
    const ready = profile !== null && coverage
      .filter(({dimension}) => dimension !== "gameplay-experience")
      .every(({status: dimensionStatus}) => dimensionStatus === "observed");
    const status = profile === null ? "blocked" as const : ready ? "ready" as const : "partial" as const;
    const gaps = coverage
      .filter(({status: dimensionStatus}) =>
        dimensionStatus === "missing" || dimensionStatus === "partial")
      .map(({dimension, basis}) => `${dimension}: ${basis}`);

    const allResults: Array<FetchResult<unknown>> = [
      profileResult,
      positiveResult,
      negativeResult,
      timelineResult,
      updatesResult,
      discoveryResult,
    ];
    const warnings = [
      ...prefixWarnings("steam_fetch", profileResult.warnings),
      ...prefixWarnings("steam_reviews:positive", positiveResult.warnings),
      ...prefixWarnings("steam_reviews:negative", negativeResult.warnings),
      ...prefixWarnings("steam_timeline", timelineResult.warnings),
      ...prefixWarnings("steam_updates", updatesResult.warnings),
      ...prefixWarnings("steam_discover", discoveryResult.warnings),
    ];

    return {
      data: {
        schemaVersion: 1,
        purpose: "first-pass-developer-triage",
        assembledAt: assembled.toISOString(),
        audience: {language, country},
        target: profile ? {
          appid: profile.appid,
          name: profile.name,
          releaseDate: profile.releaseDate,
          isFree: profile.isFree,
          shortDescription: profile.shortDescription,
          tags: profile.tags.slice(0, 12),
          genres: profile.genres,
          categories: profile.categories,
          languages: profile.languages,
          localizedCopy: requestedStorefront(profile, language),
          prices: profile.prices,
          priceHistorySummary: summarizePriceHistory(timeline),
          reviewStats: profile.reviewStats,
          currentCcu: timeline?.currentCcu ?? profile.ccu,
          currentCcuSource: timeline?.currentCcu !== null && timeline?.currentCcu !== undefined
            ? "steam_timeline"
            : profile.ccu !== null ? "steam_fetch" : null,
          owners: timeline?.owners ?? profile.owners,
          ownersSource: timeline?.owners !== null && timeline?.owners !== undefined
            ? "steam_timeline"
            : profile.owners !== null ? "steam_fetch" : null,
          avgPlaytimeHours: timeline?.avgPlaytimeHours ?? null,
          referenceLinks: profile.referenceLinks,
        } : null,
        evidence: {
          reviews: {
            selection: "recent-first",
            requestedLanguage: language,
            requestedPerPolarity: reviewLimit,
            positive: positive.map(briefReview),
            negative: negative.map(briefReview),
            limitation: "Bounded recent excerpts support hypotheses, not population rates or a complete persona cohort.",
          },
          updates: updates ? {
            summary: updates.summary,
            recentItems: updates.items.map((item) => ({
              gid: item.gid,
              title: item.title,
              url: item.url,
              publishedAt: item.publishedAt,
              type: item.type,
              updateEvidence: item.updateEvidence,
              updateConfidence: item.updateConfidence,
              platformHints: item.platformHints,
              summary: truncate(item.summary, UPDATE_SUMMARY_CHARS).text,
              highlights: item.highlights.slice(0, 3).map((highlight) =>
                truncate(highlight, UPDATE_HIGHLIGHT_CHARS).text),
            })),
          } : null,
          competition: {
            selection,
            candidates: competitors,
            limitation: "SteamSpy tag order is retained; candidates are a research shortlist, not quality, similarity, or market-share proof.",
          },
        },
        readiness: {
          status,
          dimensions: coverage,
          supportedDecisions: supportedDecisions(coverage),
          unsupportedClaims: [
            "gameplay quality without direct playtest evidence",
            "causal conversion or retention impact",
            "population rates or market share from bounded reviews",
            "competitor quality ranking from SteamSpy order",
          ],
          gaps,
          nextActions: nextActions(coverage, language),
        },
        provenance: [
          provenance("steam_fetch", profileResult),
          provenance("steam_reviews:positive", positiveResult),
          provenance("steam_reviews:negative", negativeResult),
          provenance("steam_timeline", timelineResult),
          provenance(
            "steam_updates",
            updatesResult,
            updatesResult.data === null
              ? "unavailable"
              : updatesResult.data.items.length > 0 ? "observed" : "empty",
          ),
          selection
            ? provenance(
              "steam_discover",
              discoveryResult,
              discoveryResult.data === null
                ? "unavailable"
                : discoveryResult.data.candidates.length > 0 ? "observed" : "empty",
            )
            : {
              sourceTool: "steam_discover",
              status: "not-requested",
              warnings: discoveryResult.warnings,
            },
        ],
      },
      warnings,
      meta: {
        observedAt: assembled.toISOString(),
        sources: uniqueSources(allResults),
        request: {
          appid: parsed.appid,
          language,
          country,
          reviewLimit,
          updateLimit,
          competitorLimit,
        } satisfies JsonValue,
        methodology: {
          purpose: "first-pass-developer-triage",
          calls: "profile, two review polarities, timeline, updates, then one target tag/genre competitor query",
          excerpts: {
            reviewCharacters: REVIEW_EXCERPT_CHARS,
            updateSummaryCharacters: UPDATE_SUMMARY_CHARS,
            updateHighlightsPerItem: 3,
          },
          deeperResearch: "Use the primitive Steam tools and derive_personas for full evidence.",
        },
      },
    };
  };
}
