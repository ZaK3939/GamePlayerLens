import {randomUUID} from "node:crypto";
import {
  link as nodeLink,
  readFile as nodeReadFile,
  readdir as nodeReaddir,
  rename as nodeRename,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import {z} from "zod";
import {resolvePersonaPath, type PathResolver} from "./paths.js";
import {fetchReviews, type Review, type ReviewOptions} from "./reviews.js";
import {fetchGame, type GameProfile} from "./steam.js";
import type {FetchMeta, FetchResult, JsonValue} from "./http.js";

export const MIN_REVIEWS_PER_POLARITY = 3;
export const MAX_REVIEWS_PER_POLARITY = 25;
export const DEFAULT_REVIEWS_PER_POLARITY = MAX_REVIEWS_PER_POLARITY;
export const MAX_DERIVATION_APPIDS = 12;

export const VoiceEvidenceSchema = z.object({
  text: z.string().min(1),
  source_appid: z.number().int().positive(),
  recommendation_id: z.string().min(1),
  language: z.string().min(1),
  voted_up: z.boolean(),
}).strict();

export const PersonaSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  source_appids: z.array(z.number().int().positive()).min(1),
  archetype: z.string().min(1),
  playtime_profile: z.string().min(1),
  priorities: z.array(z.string().min(1)).min(1),
  voice: z.array(VoiceEvidenceSchema).min(3).max(5),
  dealbreakers: z.array(z.string().min(1)),
  price_sensitivity: z.string().min(1),
}).strict();

export type Persona = z.infer<typeof PersonaSchema>;

export interface PersonaFileOps {
  writeFile(path: string, data: string, options: {encoding: "utf8"; flag: "wx"}): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readdir(path: string): Promise<string[]>;
}

const nodeFileOps: PersonaFileOps = {
  writeFile: (path, data, options) => nodeWriteFile(path, data, options),
  link: nodeLink,
  rename: nodeRename,
  unlink: nodeUnlink,
  readFile: nodeReadFile,
  readdir: (path) => nodeReaddir(path),
};

export interface PersonaStore {
  savePersona(persona: unknown, opts?: {overwrite?: boolean}): Promise<Persona>;
  loadPersona(id: string): Promise<Persona>;
  listPersonas(): Promise<Persona[]>;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

export function createPersonaStore(
  resolver: Pick<PathResolver, "resolvePersonaPath">,
  fileOps: Partial<PersonaFileOps> = {},
): PersonaStore {
  const ops = {...nodeFileOps, ...fileOps};

  async function savePersona(
    input: unknown,
    opts: {overwrite?: boolean} = {},
  ): Promise<Persona> {
    const persona = PersonaSchema.parse(input);
    const destination = resolver.resolvePersonaPath(persona.id);
    const temporary = join(
      dirname(destination),
      `.${basename(destination)}.${randomUUID()}.tmp`,
    );
    let operationFailed = false;

    try {
      await ops.writeFile(temporary, `${JSON.stringify(persona, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      if (opts.overwrite === true) {
        await ops.rename(temporary, destination);
      } else {
        try {
          await ops.link(temporary, destination);
        } catch (error) {
          if (isNodeError(error, "EEXIST")) {
            throw new Error(`persona already exists: ${persona.id}`);
          }
          throw error;
        }
      }
      return persona;
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      try {
        await ops.unlink(temporary);
      } catch (error) {
        if (!isNodeError(error, "ENOENT") && !operationFailed) throw error;
      }
    }
  }

  async function loadPersona(id: string): Promise<Persona> {
    const path = resolver.resolvePersonaPath(id);
    const raw = await ops.readFile(path, "utf8");
    return PersonaSchema.parse(JSON.parse(raw) as unknown);
  }

  async function listPersonas(): Promise<Persona[]> {
    const probe = resolver.resolvePersonaPath("list-probe");
    const names = (await ops.readdir(dirname(probe)))
      .filter((name) => name.endsWith(".json") && !name.startsWith("."))
      .sort();
    return Promise.all(names.map((name) => loadPersona(name.slice(0, -5))));
  }

  return {savePersona, loadPersona, listPersonas};
}

function defaultResolver(): Pick<PathResolver, "resolvePersonaPath"> {
  return {resolvePersonaPath};
}

let repositoryStore: PersonaStore | undefined;

function getRepositoryStore(): PersonaStore {
  repositoryStore ??= createPersonaStore(defaultResolver());
  return repositoryStore;
}

export function savePersona(
  persona: unknown,
  opts?: {overwrite?: boolean},
): Promise<Persona> {
  return getRepositoryStore().savePersona(persona, opts);
}

export function loadPersona(id: string): Promise<Persona> {
  return getRepositoryStore().loadPersona(id);
}

export function listPersonas(): Promise<Persona[]> {
  return getRepositoryStore().listPersonas();
}

export interface DerivationReview extends Review {
  sourceAppid: number;
}

export interface DerivationPack {
  requestedCount: number;
  schema: Record<string, unknown>;
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
  japaneseSelected: number;
  fallbackSelected: number;
  totalSelected: number;
}

interface PolarityEvidence {
  reviews: Review[];
  selectedFrom: Map<string, "japanese" | "fallback">;
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
): Promise<PolarityEvidence> {
  const japanese = await reviewFetcher(appid, {
    language: "japanese",
    type: polarity,
    limit: reviewsPerPolarity,
  });
  const warnings = contextualWarnings(appid, polarity, japanese.warnings);
  const selected: Review[] = [];
  const seen = new Set<string>();
  const selectedFrom = new Map<string, "japanese" | "fallback">();

  for (const review of japanese.data ?? []) {
    if (!review.review || seen.has(review.recommendationId)) continue;
    seen.add(review.recommendationId);
    selected.push(review);
    selectedFrom.set(review.recommendationId, "japanese");
    if (selected.length === reviewsPerPolarity) break;
  }

  if (selected.length < reviewsPerPolarity) {
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

function personaMeta(
  observedAt: string,
  appids: number[],
  count: number,
  reviewsPerPolarity: number,
  sampling: JsonValue[],
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
    request: {appids, count, reviewsPerPolarity},
    methodology: {
      strategy: "recent-polarity-balanced",
      ordering: "round-robin-appid-polarity",
      representative: false,
      requestedPerPolarity: reviewsPerPolarity,
      appids: sampling,
      caveat: "Balanced samples support issue discovery and do not represent population shares; use game-profile reviewStats for population ratios.",
    },
  };
}

export function createPersonaDeriver(
  dependencies: PersonaDeriverDependencies = {},
): (
  appids: number[],
  count?: number,
  reviewsPerPolarity?: number,
) => Promise<FetchResult<DerivationPack>> {
  const gameFetcher = dependencies.fetchGame ?? fetchGame;
  const reviewFetcher = dependencies.fetchReviews ?? fetchReviews;
  const now = dependencies.now ?? (() => new Date());

  return async (
    appids: number[],
    count = 5,
    reviewsPerPolarity = DEFAULT_REVIEWS_PER_POLARITY,
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
        fetchPolarityEvidence(appid, "positive", reviewFetcher, reviewsPerPolarity),
        fetchPolarityEvidence(appid, "negative", reviewFetcher, reviewsPerPolarity),
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
        positive: {japaneseSelected: 0, fallbackSelected: 0, totalSelected: 0},
        negative: {japaneseSelected: 0, fallbackSelected: 0, totalSelected: 0},
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
          reviews.push({...review, sourceAppid: evidence.appid});
          const actualSelection = actualSelectionByAppid.get(evidence.appid);
          if (!actualSelection) continue;
          const source = evidence[polarity].selectedFrom.get(review.recommendationId);
          if (source === "japanese") actualSelection[polarity].japaneseSelected += 1;
          else if (source === "fallback") actualSelection[polarity].fallbackSelected += 1;
          actualSelection[polarity].totalSelected += 1;
        }
      }
    }

    for (const {appid, game} of evidenceByAppid) {
      const actualSelection = actualSelectionByAppid.get(appid);
      if (!actualSelection) continue;
      const population = game.data?.reviewStats ?? null;
      sampling.push({
        appid,
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
        },
      });
    }

    const meta = personaMeta(
      observed.toISOString(),
      uniqueAppids,
      count,
      reviewsPerPolarity,
      sampling,
    );
    return {
      data: {
        requestedCount: count,
        schema: z.toJSONSchema(PersonaSchema) as Record<string, unknown>,
        games,
        reviews,
        instruction: [
          `この根拠素材から異なるペルソナを ${count} 件生成してください。`,
          "voice の各項目は reviews の本文・sourceAppid・recommendationId・language・votedUp に直接対応させてください。",
          "The polarity-balanced review sample is not representative of population shares.",
          "生成した各 JSON は Persona schema で検証し、save_persona で1件ずつ保存してください。",
        ].join(" "),
      },
      warnings,
      meta,
    };
  };
}

export const buildDerivationPack = createPersonaDeriver();
