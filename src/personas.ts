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
import type {FetchResult} from "./http.js";

const REVIEWS_PER_POLARITY = 25;

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
  fetchGame: typeof fetchGame;
  fetchReviews: typeof fetchReviews;
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
): Promise<FetchResult<Review[]>> {
  const japanese = await reviewFetcher(appid, {
    language: "japanese",
    type: polarity,
    limit: REVIEWS_PER_POLARITY,
  });
  const warnings = contextualWarnings(appid, polarity, japanese.warnings);
  const selected: Review[] = [];
  const seen = new Set<string>();

  for (const review of japanese.data ?? []) {
    if (!review.review || seen.has(review.recommendationId)) continue;
    seen.add(review.recommendationId);
    selected.push(review);
    if (selected.length === REVIEWS_PER_POLARITY) break;
  }

  if (selected.length < REVIEWS_PER_POLARITY) {
    const fallback = await reviewFetcher(appid, {
      language: "all",
      type: polarity,
      limit: Math.min(300, REVIEWS_PER_POLARITY * 2),
    });
    warnings.push(...contextualWarnings(appid, polarity, fallback.warnings));
    for (const review of fallback.data ?? []) {
      if (!review.review || seen.has(review.recommendationId)) continue;
      seen.add(review.recommendationId);
      selected.push(review);
      if (selected.length === REVIEWS_PER_POLARITY) break;
    }
  }

  if (selected.length < REVIEWS_PER_POLARITY) {
    warnings.push(
      `appid ${appid} ${polarity} evidence shortage: ${selected.length} of ${REVIEWS_PER_POLARITY}`,
    );
  }
  return {data: selected, warnings};
}

export function createPersonaDeriver(
  dependencies: PersonaDeriverDependencies = {fetchGame, fetchReviews},
): (appids: number[], count?: number) => Promise<FetchResult<DerivationPack>> {
  return async (appids: number[], count = 5) => {
    if (!Number.isInteger(count) || count < 1 || count > 12) {
      throw new TypeError("count must be an integer from 1 to 12");
    }
    if (!Array.isArray(appids) || appids.length === 0) {
      throw new TypeError("appids must contain at least one Steam appid");
    }
    const uniqueAppids = [...new Set(appids)];
    if (uniqueAppids.some((appid) => !Number.isInteger(appid) || appid <= 0)) {
      throw new TypeError("appids must contain positive integers");
    }

    const games: GameProfile[] = [];
    const reviews: DerivationReview[] = [];
    const globalReviewIds = new Set<string>();
    const warnings: string[] = [];

    for (const appid of uniqueAppids) {
      const [game, positive, negative] = await Promise.all([
        dependencies.fetchGame(appid),
        fetchPolarityEvidence(appid, "positive", dependencies.fetchReviews),
        fetchPolarityEvidence(appid, "negative", dependencies.fetchReviews),
      ]);
      warnings.push(...contextualWarnings(appid, "game", game.warnings));
      warnings.push(...positive.warnings, ...negative.warnings);
      if (game.data) games.push(game.data);
      else warnings.push(`appid ${appid} game profile unavailable`);

      for (const review of [...(positive.data ?? []), ...(negative.data ?? [])]) {
        if (globalReviewIds.has(review.recommendationId)) continue;
        globalReviewIds.add(review.recommendationId);
        reviews.push({...review, sourceAppid: appid});
      }
    }

    return {
      data: {
        requestedCount: count,
        schema: z.toJSONSchema(PersonaSchema) as Record<string, unknown>,
        games,
        reviews,
        instruction: [
          `この根拠素材から異なるペルソナを ${count} 件生成してください。`,
          "voice の各項目は reviews の本文・sourceAppid・recommendationId・language・votedUp に直接対応させてください。",
          "生成した各 JSON は Persona schema で検証し、save_persona で1件ずつ保存してください。",
        ].join(" "),
      },
      warnings,
    };
  };
}

export const buildDerivationPack = createPersonaDeriver();
