import {z} from "zod";
import type {FetchMeta, FetchResult, JsonValue} from "./http.js";
import {
  GeneratedPersonaSchema,
  MAX_DERIVATION_APPIDS,
  MIN_UNIQUE_VOICE_REVIEWS_PER_PERSONA,
  PERSONA_FOCUS_VALUES,
  SourceRoleSchema,
  type PersonaFocus,
  type PersonaSourceRole,
} from "./persona-schemas.js";
import {fetchReviews, type Review, type ReviewOptions} from "./reviews.js";
import {fetchGame, type GameProfile} from "./steam.js";

export const MIN_REVIEWS_PER_POLARITY = 3;
export const MAX_REVIEWS_PER_POLARITY = 25;
export const DEFAULT_REVIEWS_PER_POLARITY = MAX_REVIEWS_PER_POLARITY;
export interface DerivationReview extends Review {
  sourceAppid: number;
  sourceRole: "target" | "competitor" | "reference";
}

export interface PersonaDerivationOptions {
  targetAppid?: number;
  market?: string;
  language?: string;
  focus?: PersonaFocus[];
  sourceRoles?: PersonaSourceRole[];
}

interface NormalizedPersonaDerivationOptions {
  targetAppid?: number;
  market: string;
  language: string;
  focus: PersonaFocus[];
  sourceRoles: PersonaSourceRole[];
}

export interface DerivationPack {
  requestedCount: number;
  generationReadiness: {
    status: "ready" | "partial" | "blocked";
    generationAllowed: boolean;
    requestedCount: number;
    supportedCount: number;
    availableUniqueReviewCount: number;
    requiredUniqueReviewCount: number;
    minimumUniqueReviewsPerPersona: number;
    voiceReuseAllowed: false;
  };
  schema: Record<string, unknown>;
  brief: {
    targetAppid: number | null;
    market: string;
    language: string;
    focus: PersonaFocus[];
    sources: Array<{
      appid: number;
      role: "target" | "competitor" | "reference";
    }>;
  };
  games: GameProfile[];
  reviews: DerivationReview[];
  instruction: string;
}

export interface PersonaDeriverDependencies {
  fetchGame?: typeof fetchGame;
  fetchReviews?: typeof fetchReviews;
  now?: () => Date;
}

interface PolaritySelectionStats extends Record<string, number> {
  requestedLanguageSelected: number;
  fallbackSelected: number;
  totalSelected: number;
}

interface PolarityEvidence {
  reviews: Review[];
  selectedFrom: Map<string, "requested-language" | "fallback">;
  warnings: string[];
}

function contextualWarnings(
  appid: number,
  polarity: "positive" | "negative" | "game",
  warnings: string[],
): string[] {
  return warnings.map((warning) => `appid ${appid} ${polarity}: ${warning}`);
}

async function fetchPolarityEvidence(
  appid: number,
  polarity: "positive" | "negative",
  reviewFetcher: typeof fetchReviews,
  reviewsPerPolarity: number,
  language: string,
): Promise<PolarityEvidence> {
  const requestedLanguage = await reviewFetcher(appid, {
    language,
    type: polarity,
    limit: reviewsPerPolarity,
  });
  const warnings = contextualWarnings(appid, polarity, requestedLanguage.warnings);
  const selected: Review[] = [];
  const seen = new Set<string>();
  const selectedFrom = new Map<string, "requested-language" | "fallback">();

  for (const review of requestedLanguage.data ?? []) {
    if (!review.review || seen.has(review.recommendationId)) continue;
    seen.add(review.recommendationId);
    selected.push(review);
    selectedFrom.set(review.recommendationId, "requested-language");
    if (selected.length === reviewsPerPolarity) break;
  }

  if (language !== "all" && selected.length < reviewsPerPolarity) {
    const fallback = await reviewFetcher(appid, {
      language: "all",
      type: polarity,
      limit: Math.min(300, reviewsPerPolarity * 2),
    });
    warnings.push(...contextualWarnings(appid, polarity, fallback.warnings));
    for (const review of fallback.data ?? []) {
      if (!review.review || seen.has(review.recommendationId)) continue;
      seen.add(review.recommendationId);
      selected.push(review);
      selectedFrom.set(review.recommendationId, "fallback");
      if (selected.length === reviewsPerPolarity) break;
    }
  }

  if (selected.length < reviewsPerPolarity) {
    warnings.push(
      `appid ${appid} ${polarity} evidence shortage: ${selected.length} of ${reviewsPerPolarity}`,
    );
  }
  return {
    reviews: selected,
    selectedFrom,
    warnings,
  };
}

function ratio(positive: number, negative: number): number | null {
  const total = positive + negative;
  return total > 0 ? Math.round((positive / total) * 100) : null;
}

function generationReadiness(
  requestedCount: number,
  availableUniqueReviewCount: number,
): DerivationPack["generationReadiness"] {
  const supportedCount = Math.min(
    requestedCount,
    Math.floor(availableUniqueReviewCount / MIN_UNIQUE_VOICE_REVIEWS_PER_PERSONA),
  );
  return {
    status: supportedCount === 0
      ? "blocked"
      : supportedCount < requestedCount
        ? "partial"
        : "ready",
    generationAllowed: supportedCount > 0,
    requestedCount,
    supportedCount,
    availableUniqueReviewCount,
    requiredUniqueReviewCount: requestedCount * MIN_UNIQUE_VOICE_REVIEWS_PER_PERSONA,
    minimumUniqueReviewsPerPersona: MIN_UNIQUE_VOICE_REVIEWS_PER_PERSONA,
    voiceReuseAllowed: false,
  };
}

function personaGenerationInstruction(
  readiness: DerivationPack["generationReadiness"],
): string {
  if (readiness.status === "blocked") {
    return [
      "generationReadiness.status=blockedです。ペルソナを生成・保存しないでください。",
      `一意なreview voice根拠は${readiness.availableUniqueReviewCount}件で、1 personaに必要な${readiness.minimumUniqueReviewsPerPersona}件を満たしていません。`,
      "voice、observed_patterns、decision_profileを捏造せず、根拠不足を途中結果として返してください。",
    ].join(" ");
  }

  const generationDirective = readiness.status === "partial"
    ? `要求${readiness.requestedCount}件のうち、根拠で支えられるペルソナを ${readiness.supportedCount} 件だけ生成してください。`
    : `この根拠素材から異なるペルソナを ${readiness.supportedCount} 件生成してください。`;
  return [
    generationDirective,
    "voice の各項目は reviews の本文・sourceAppid・recommendationId・language・votedUp に直接対応させ、同じreview voiceをpersona間で再利用しないでください。",
    "schema_version=2 とし、target_context、decision_profile、evidence_basisを省略しないでください。",
    "observed_patternsはvoiceを参照し、inferred_traitsとlimitationsを分離してください。更新反応の根拠がなければupdate_reactionをunknownとして不足根拠を記録してください。",
    "target、competitor、referenceのsourceRoleを混同せず、各personaのadoption/retention/churn triggerが実質的に異なることを確認してください。",
    "The polarity-balanced review sample is not representative of population shares.",
    "生成した各 JSON は Persona schema で検証し、save_persona で1件ずつ保存してください。",
  ].join(" ");
}

function personaMeta(
  observedAt: string,
  appids: number[],
  count: number,
  reviewsPerPolarity: number,
  sampling: JsonValue[],
  options: NormalizedPersonaDerivationOptions,
): FetchMeta {
  return {
    observedAt,
    sources: [
      {name: "Steam Store", homepage: "https://store.steampowered.com/"},
      {
        name: "SteamSpy",
        homepage: "https://steamspy.com/about",
        notes: "Review population counts are estimates; recent releases and small samples can be unreliable.",
      },
    ],
    request: {
      appids,
      count,
      reviewsPerPolarity,
      ...(options.targetAppid ? {targetAppid: options.targetAppid} : {}),
      market: options.market,
      language: options.language,
      focus: options.focus,
      sourceRoles: options.sourceRoles,
    },
    methodology: {
      strategy: "requested-language-first-recent-polarity-balanced",
      ordering: "round-robin-appid-polarity",
      representative: false,
      requestedLanguage: options.language,
      requestedPerPolarity: reviewsPerPolarity,
      appids: sampling,
      caveat: "Balanced samples support issue discovery and do not represent population shares; source roles and playtime coverage describe the sample, not market segment size.",
    },
  };
}

const DEFAULT_PERSONA_FOCUS: PersonaFocus[] = [
  "adoption",
  "retention",
  "churn",
  "update-response",
];

function normalizeDerivationOptions(
  uniqueAppids: number[],
  input: PersonaDerivationOptions,
): NormalizedPersonaDerivationOptions {
  const market = input.market?.trim() || "Japan";
  if (market.length > 80) throw new TypeError("market must contain at most 80 characters");
  const language = (input.language?.trim() || "japanese").toLowerCase();
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(language)) {
    throw new TypeError("language must be a Steam language code");
  }
  if (input.targetAppid !== undefined && !uniqueAppids.includes(input.targetAppid)) {
    throw new TypeError("targetAppid must be included in appids");
  }
  const focus = input.focus ?? DEFAULT_PERSONA_FOCUS;
  if (focus.length === 0 || focus.length > PERSONA_FOCUS_VALUES.length) {
    throw new TypeError("focus must contain 1 to 6 values");
  }
  const allowed = new Set<string>(PERSONA_FOCUS_VALUES);
  if (focus.some((value) => !allowed.has(value)) || new Set(focus).size !== focus.length) {
    throw new TypeError("focus values must be known and unique");
  }

  let targetAppid = input.targetAppid;
  let sourceRoles: PersonaSourceRole[];
  if (input.sourceRoles !== undefined) {
    const parsed = z.array(SourceRoleSchema)
      .min(1)
      .max(MAX_DERIVATION_APPIDS)
      .safeParse(input.sourceRoles);
    if (!parsed.success) {
      throw new TypeError("sourceRoles must contain valid appid and role entries");
    }
    const roleAppids = parsed.data.map(({appid}) => appid);
    const coversExactly = roleAppids.length === uniqueAppids.length
      && new Set(roleAppids).size === roleAppids.length
      && roleAppids.every((appid) => uniqueAppids.includes(appid));
    if (!coversExactly) {
      throw new TypeError("sourceRoles must cover exactly the requested appids");
    }
    const targets = parsed.data.filter(({role}) => role === "target");
    if (targets.length > 1) {
      throw new TypeError("sourceRoles may contain at most one target");
    }
    if (targetAppid !== undefined && targets[0]?.appid !== targetAppid) {
      throw new TypeError("targetAppid must match the target entry in sourceRoles");
    }
    targetAppid ??= targets[0]?.appid;
    const byAppid = new Map(parsed.data.map((source) => [source.appid, source]));
    sourceRoles = uniqueAppids.map((appid) => byAppid.get(appid)!);
  } else {
    sourceRoles = uniqueAppids.map((appid) => ({
      appid,
      role: targetAppid === undefined
        ? "reference"
        : appid === targetAppid
          ? "target"
          : "competitor",
    }));
  }
  return {targetAppid, market, language, focus: [...focus], sourceRoles};
}

function sourceRole(
  appid: number,
  sourceRoles: PersonaSourceRole[],
): "target" | "competitor" | "reference" {
  const source = sourceRoles.find((candidate) => candidate.appid === appid);
  if (!source) throw new TypeError(`source role missing for appid ${appid}`);
  return source.role;
}

function sampleCoverage(reviews: DerivationReview[]): JsonValue {
  const playtimeBands = {under2h: 0, from2to20h: 0, from20to100h: 0, over100h: 0};
  const languages: Record<string, number> = {};
  const timestamps: number[] = [];
  let invalidTimestampCount = 0;
  for (const review of reviews) {
    if (review.playtimeHours < 2) playtimeBands.under2h += 1;
    else if (review.playtimeHours < 20) playtimeBands.from2to20h += 1;
    else if (review.playtimeHours < 100) playtimeBands.from20to100h += 1;
    else playtimeBands.over100h += 1;
    languages[review.language] = (languages[review.language] ?? 0) + 1;
    if (!Number.isFinite(review.timestamp)
      || !Number.isInteger(review.timestamp)
      || review.timestamp < 0) {
      invalidTimestampCount += 1;
    } else if (review.timestamp > 0) {
      const milliseconds = review.timestamp * 1_000;
      if (Number.isNaN(new Date(milliseconds).getTime())) invalidTimestampCount += 1;
      else timestamps.push(milliseconds);
    }
  }
  timestamps.sort((left, right) => left - right);
  return {
    playtimeBands,
    languages,
    invalidTimestampCount,
    publishedRange: {
      earliest: timestamps.length > 0 ? new Date(timestamps[0]!).toISOString() : null,
      latest: timestamps.length > 0 ? new Date(timestamps.at(-1)!).toISOString() : null,
    },
  };
}

export function createPersonaDeriver(
  dependencies: PersonaDeriverDependencies = {},
): (
  appids: number[],
  count?: number,
  reviewsPerPolarity?: number,
  options?: PersonaDerivationOptions,
) => Promise<FetchResult<DerivationPack>> {
  const gameFetcher = dependencies.fetchGame ?? fetchGame;
  const reviewFetcher = dependencies.fetchReviews ?? fetchReviews;
  const now = dependencies.now ?? (() => new Date());

  return async (
    appids: number[],
    count = 5,
    reviewsPerPolarity = DEFAULT_REVIEWS_PER_POLARITY,
    inputOptions: PersonaDerivationOptions = {},
  ) => {
    if (!Number.isInteger(count) || count < 1 || count > 12) {
      throw new TypeError("count must be an integer from 1 to 12");
    }
    if (!Array.isArray(appids) || appids.length === 0) {
      throw new TypeError("appids must contain at least one Steam appid");
    }
    if (
      !Number.isInteger(reviewsPerPolarity)
      || reviewsPerPolarity < MIN_REVIEWS_PER_POLARITY
      || reviewsPerPolarity > MAX_REVIEWS_PER_POLARITY
    ) {
      throw new TypeError(
        `reviewsPerPolarity must be an integer from ${MIN_REVIEWS_PER_POLARITY} to ${MAX_REVIEWS_PER_POLARITY}`,
      );
    }
    if (appids.length > MAX_DERIVATION_APPIDS) {
      throw new TypeError(`appids must contain at most ${MAX_DERIVATION_APPIDS} Steam appids`);
    }
    const uniqueAppids = [...new Set(appids)];
    if (uniqueAppids.some((appid) => !Number.isInteger(appid) || appid <= 0)) {
      throw new TypeError("appids must contain positive integers");
    }
    const options = normalizeDerivationOptions(uniqueAppids, inputOptions);

    const games: GameProfile[] = [];
    const reviews: DerivationReview[] = [];
    const globalReviewIds = new Set<string>();
    const warnings: string[] = [];
    const sampling: JsonValue[] = [];
    const evidenceByAppid: Array<{
      appid: number;
      game: Awaited<ReturnType<typeof gameFetcher>>;
      positive: PolarityEvidence;
      negative: PolarityEvidence;
    }> = [];
    const observed = now();
    if (Number.isNaN(observed.getTime())) throw new TypeError("now must be valid");

    for (const appid of uniqueAppids) {
      const [game, positive, negative] = await Promise.all([
        gameFetcher(appid),
        fetchPolarityEvidence(
          appid,
          "positive",
          reviewFetcher,
          reviewsPerPolarity,
          options.language,
        ),
        fetchPolarityEvidence(
          appid,
          "negative",
          reviewFetcher,
          reviewsPerPolarity,
          options.language,
        ),
      ]);
      warnings.push(...contextualWarnings(appid, "game", game.warnings));
      warnings.push(...positive.warnings, ...negative.warnings);
      if (game.data) games.push(game.data);
      else warnings.push(`appid ${appid} game profile unavailable`);

      evidenceByAppid.push({appid, game, positive, negative});
    }

    const actualSelectionByAppid = new Map<number, Record<
      "positive" | "negative",
      PolaritySelectionStats
    >>();
    for (const {appid} of evidenceByAppid) {
      const actualSelection = {
        positive: {requestedLanguageSelected: 0, fallbackSelected: 0, totalSelected: 0},
        negative: {requestedLanguageSelected: 0, fallbackSelected: 0, totalSelected: 0},
      } satisfies Record<"positive" | "negative", PolaritySelectionStats>;
      actualSelectionByAppid.set(appid, actualSelection);
    }

    for (let index = 0; index < reviewsPerPolarity; index += 1) {
      for (const evidence of evidenceByAppid) {
        for (const polarity of ["positive", "negative"] as const) {
          const review = evidence[polarity].reviews[index];
          if (!review) continue;
          if (globalReviewIds.has(review.recommendationId)) continue;
          globalReviewIds.add(review.recommendationId);
          reviews.push({
            ...review,
            sourceAppid: evidence.appid,
            sourceRole: sourceRole(evidence.appid, options.sourceRoles),
          });
          const actualSelection = actualSelectionByAppid.get(evidence.appid);
          if (!actualSelection) continue;
          const source = evidence[polarity].selectedFrom.get(review.recommendationId);
          if (source === "requested-language") {
            actualSelection[polarity].requestedLanguageSelected += 1;
          }
          else if (source === "fallback") actualSelection[polarity].fallbackSelected += 1;
          actualSelection[polarity].totalSelected += 1;
        }
      }
    }

    for (const {appid, game} of evidenceByAppid) {
      const actualSelection = actualSelectionByAppid.get(appid);
      if (!actualSelection) continue;
      const population = game.data?.reviewStats ?? null;
      const selectedReviews = reviews.filter((review) => review.sourceAppid === appid);
      sampling.push({
        appid,
        role: sourceRole(appid, options.sourceRoles),
        population: {
          positive: population?.positive ?? null,
          negative: population?.negative ?? null,
          positivePercent: population?.positivePercent ?? null,
        },
        sample: {
          ...actualSelection,
          positivePercent: ratio(
            actualSelection.positive.totalSelected,
            actualSelection.negative.totalSelected,
          ),
          coverage: sampleCoverage(selectedReviews),
        },
      });
    }

    const meta = personaMeta(
      observed.toISOString(),
      uniqueAppids,
      count,
      reviewsPerPolarity,
      sampling,
      options,
    );
    const readiness = generationReadiness(count, reviews.length);
    if (readiness.status === "blocked") {
      warnings.push(
        `persona generation blocked: 0 of ${count} requested personas have disjoint review voice support`,
      );
    } else if (readiness.status === "partial") {
      warnings.push(
        `persona generation limited: ${readiness.supportedCount} of ${count} requested personas have disjoint review voice support`,
      );
    }
    return {
      data: {
        requestedCount: count,
        generationReadiness: readiness,
        schema: z.toJSONSchema(GeneratedPersonaSchema) as Record<string, unknown>,
        brief: {
          targetAppid: options.targetAppid ?? null,
          market: options.market,
          language: options.language,
          focus: options.focus,
          sources: options.sourceRoles,
        },
        games,
        reviews,
        instruction: personaGenerationInstruction(readiness),
      },
      warnings,
      meta,
    };
  };
}

export const buildDerivationPack = createPersonaDeriver();
