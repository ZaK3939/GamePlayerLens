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
export const MIN_UNIQUE_VOICE_REVIEWS_PER_PERSONA = 3;
export const MAX_DERIVATION_APPIDS = 12;
export const PERSONA_FOCUS_VALUES = [
  "adoption",
  "retention",
  "churn",
  "price",
  "localization",
  "update-response",
] as const;

export const VoiceEvidenceSchema = z.object({
  text: z.string().min(1),
  source_appid: z.number().int().positive(),
  recommendation_id: z.string().min(1),
  language: z.string().min(1),
  voted_up: z.boolean(),
}).strict();

const SourceRoleSchema = z.object({
  appid: z.number().int().positive(),
  role: z.enum(["target", "competitor", "reference"]),
}).strict();

export type PersonaSourceRole = z.infer<typeof SourceRoleSchema>;

const TargetContextSchema = z.object({
  market: z.string().trim().min(1).max(80),
  language: z.string().trim().min(1).max(32),
  source_roles: z.array(SourceRoleSchema).min(1).max(MAX_DERIVATION_APPIDS),
}).strict();

const DecisionProfileSchema = z.object({
  adoption_trigger: z.string().trim().min(1).max(1_000),
  retention_trigger: z.string().trim().min(1).max(1_000),
  churn_trigger: z.string().trim().min(1).max(1_000),
  update_reaction: z.string().trim().min(1).max(1_000),
}).strict();

const VoiceReferenceSchema = z.object({
  source_appid: z.number().int().positive(),
  recommendation_id: z.string().min(1),
}).strict();

const EvidenceBasisSchema = z.object({
  observed_patterns: z.array(z.object({
    claim: z.string().trim().min(1).max(1_000),
    evidence: z.array(VoiceReferenceSchema).min(1).max(5),
  }).strict()).min(2).max(8),
  inferred_traits: z.array(z.object({
    claim: z.string().trim().min(1).max(1_000),
    basis: z.string().trim().min(1).max(2_000),
    confidence: z.enum(["low", "medium", "high"]),
  }).strict()).max(8),
  limitations: z.array(z.string().trim().min(1).max(1_000)).min(1).max(8),
  overall_confidence: z.enum(["low", "medium", "high"]),
}).strict();

const PersonaBaseShape = {
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  source_appids: z.array(z.number().int().positive()).min(1),
  archetype: z.string().min(1),
  playtime_profile: z.string().min(1),
  priorities: z.array(z.string().min(1)).min(1),
  voice: z.array(VoiceEvidenceSchema).min(MIN_UNIQUE_VOICE_REVIEWS_PER_PERSONA).max(5),
  dealbreakers: z.array(z.string().min(1)),
  price_sensitivity: z.string().min(1),
};

interface PersonaIssue {
  path: Array<string | number>;
  message: string;
}

function personaIssues(value: {
  source_appids: number[];
  voice: Array<{source_appid: number; recommendation_id: string}>;
  schema_version?: 2;
  target_context?: z.infer<typeof TargetContextSchema>;
  decision_profile?: z.infer<typeof DecisionProfileSchema>;
  evidence_basis?: z.infer<typeof EvidenceBasisSchema>;
}): PersonaIssue[] {
  const issues: PersonaIssue[] = [];
  const sourceAppids = new Set(value.source_appids);
  if (sourceAppids.size !== value.source_appids.length) {
    issues.push({path: ["source_appids"], message: "source_appids must be unique"});
  }
  const voiceKeys = new Set<string>();
  for (const [index, voice] of value.voice.entries()) {
    if (!sourceAppids.has(voice.source_appid)) {
      issues.push({
        path: ["voice", index, "source_appid"],
        message: "voice source_appid must be listed in source_appids",
      });
    }
    const key = `${voice.source_appid}:${voice.recommendation_id}`;
    if (voiceKeys.has(key)) {
      issues.push({
        path: ["voice", index, "recommendation_id"],
        message: "voice evidence references must be unique",
      });
    }
    voiceKeys.add(key);
  }

  const hasV2 = value.schema_version !== undefined
    || value.target_context !== undefined
    || value.decision_profile !== undefined
    || value.evidence_basis !== undefined;
  if (!hasV2) return issues;
  if (value.schema_version !== 2) {
    issues.push({path: ["schema_version"], message: "v2 persona requires schema_version 2"});
  }
  for (const field of ["target_context", "decision_profile", "evidence_basis"] as const) {
    if (value[field] === undefined) {
      issues.push({path: [field], message: `v2 persona requires ${field}`});
    }
  }
  if (value.target_context) {
    const roleAppids = value.target_context.source_roles.map((source) => source.appid);
    if (new Set(roleAppids).size !== roleAppids.length) {
      issues.push({
        path: ["target_context", "source_roles"],
        message: "source role appids must be unique",
      });
    }
    const sameAppids = roleAppids.length === sourceAppids.size
      && roleAppids.every((appid) => sourceAppids.has(appid));
    if (!sameAppids) {
      issues.push({
        path: ["target_context", "source_roles"],
        message: "source roles must cover exactly source_appids",
      });
    }
    if (value.target_context.source_roles.filter((source) => source.role === "target").length > 1) {
      issues.push({
        path: ["target_context", "source_roles"],
        message: "at most one source appid may be the target",
      });
    }
  }
  for (const [patternIndex, pattern] of (value.evidence_basis?.observed_patterns ?? []).entries()) {
    for (const [evidenceIndex, evidence] of pattern.evidence.entries()) {
      if (!voiceKeys.has(`${evidence.source_appid}:${evidence.recommendation_id}`)) {
        issues.push({
          path: ["evidence_basis", "observed_patterns", patternIndex, "evidence", evidenceIndex],
          message: "observed pattern evidence must reference persona voice",
        });
      }
    }
  }
  return issues;
}

function addPersonaIssues(
  value: Parameters<typeof personaIssues>[0],
  context: {addIssue(issue: {code: "custom"; path: Array<string | number>; message: string}): void},
): void {
  for (const issue of personaIssues(value)) context.addIssue({code: "custom", ...issue});
}

export const PersonaSchema = z.object({
  ...PersonaBaseShape,
  schema_version: z.literal(2).optional(),
  target_context: TargetContextSchema.optional(),
  decision_profile: DecisionProfileSchema.optional(),
  evidence_basis: EvidenceBasisSchema.optional(),
}).strict().superRefine(addPersonaIssues);

export const GeneratedPersonaSchema = z.object({
  ...PersonaBaseShape,
  schema_version: z.literal(2),
  target_context: TargetContextSchema,
  decision_profile: DecisionProfileSchema,
  evidence_basis: EvidenceBasisSchema,
}).strict().superRefine(addPersonaIssues);

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
  sourceRole: "target" | "competitor" | "reference";
}

export type PersonaFocus = typeof PERSONA_FOCUS_VALUES[number];

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
