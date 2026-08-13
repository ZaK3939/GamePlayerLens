import {type FetchMeta, type FetchResult, type JsonValue} from "./http.js";
import {strictFiniteNumber} from "./normalize.js";
import {
  DEFAULT_EXTERNAL_RETRY_DELAY_MS,
  MAX_EXTERNAL_ATTEMPTS,
  MAX_EXTERNAL_RETRY_AFTER_MS,
  externalFailureWarning,
  externalRetryAfterMs,
  isExternalTimeout,
  isTransientHttpStatus,
  waitForExternalRetry,
} from "./retry.js";
import {
  MAX_JSON_RESPONSE_BYTES,
  readBoundedJsonBody,
  ResponseBodyTooLargeError,
} from "./response-body.js";

const STEAMSPY_API = "https://steamspy.com/api.php";
const STEAMSPY_ABOUT = "https://steamspy.com/about";
const STEAMSPY_SOURCE = "steamspy discovery";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = MAX_JSON_RESPONSE_BYTES;
const MAX_JSON_DEPTH = 128;
const MAX_ADDITIONAL_VALUES = 3;
const MAX_EXCLUDED_APPIDS = 50;
const INTERSECTION_POOL_LIMIT = 50;

export type DiscoveryKind = "tag" | "genre";

export interface DiscoveryInput {
  kind: DiscoveryKind;
  value: string;
  additionalValues?: string[];
  excludeAppids?: number[];
  limit?: number;
}

export interface DiscoveryQuery {
  kind: DiscoveryKind;
  value: string;
  additionalValues?: string[];
  excludeAppids?: number[];
  limit: number;
}

export interface DiscoveryCandidate {
  rank: number;
  appid: number;
  name: string;
  owners: string | null;
  ccu: number | null;
  positive: number | null;
  negative: number | null;
  positivePercent: number | null;
  matchedValues?: string[];
  sourceRanks?: Record<string, number>;
}

export interface DiscoveryMethodology {
  ranking: string;
  figures: string;
  owners: string;
  reliability: string;
  representative: boolean;
  matching?: string;
  pool?: string;
}

export interface DiscoveryResult {
  query: DiscoveryQuery;
  observedAt: string;
  candidates: DiscoveryCandidate[];
  methodology: DiscoveryMethodology;
}

export type DiscoveryRequest = (
  url: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface DiscoveryDependencies {
  now?: () => Date;
  request?: DiscoveryRequest;
}

export interface OrderedTopLevelObject {
  keys: string[];
  values: Record<string, unknown>;
}

const METHODOLOGY: DiscoveryMethodology = {
  ranking: "SteamSpy API order was retained; no custom reranking occurred.",
  figures: "SteamSpy figures are estimates.",
  owners: "owners is an ownership estimate range, not unit sales.",
  reliability: "Recent and small-sample games can be unreliable.",
  representative: false,
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

class NonObjectJsonError extends TypeError {}
class InvalidJsonBodyError extends SyntaxError {}

class TopLevelKeyScanner {
  private position = 0;
  private readonly keys: string[] = [];

  constructor(private readonly text: string) {}

  scan(): string[] {
    this.skipWhitespace();
    this.skipObject(1);
    this.skipWhitespace();
    this.expectEnd();
    return this.keys;
  }

  private skipValue(depth: number): void {
    const character = this.text[this.position];
    if (character === "\"") {
      this.skipString();
      return;
    }
    if (character === "{") {
      this.skipObject(depth + 1);
      return;
    }
    if (character === "[") {
      this.skipArray(depth + 1);
      return;
    }
    const start = this.position;
    while (this.position < this.text.length) {
      const current = this.text[this.position];
      if (current === "," || current === "}" || current === "]"
        || this.isWhitespace(current)) break;
      this.position += 1;
    }
    if (this.position === start) {
      throw new InvalidJsonBodyError("invalid top-level JSON value");
    }
  }

  private skipObject(depth: number): void {
    this.requireDepth(depth);
    this.expect("{");
    this.skipWhitespace();
    if (this.consume("}")) return;

    const seen = new Set<string>();
    while (true) {
      this.skipWhitespace();
      const key = this.readString();
      if (seen.has(key)) {
        throw new InvalidJsonBodyError("duplicate JSON object key");
      }
      seen.add(key);
      if (depth === 1) this.keys.push(key);

      this.skipWhitespace();
      this.expect(":");
      this.skipWhitespace();
      this.skipValue(depth);
      this.skipWhitespace();
      if (this.consume("}")) return;
      this.expect(",");
    }
  }

  private skipArray(depth: number): void {
    this.requireDepth(depth);
    this.expect("[");
    this.skipWhitespace();
    if (this.consume("]")) return;

    while (true) {
      this.skipValue(depth);
      this.skipWhitespace();
      if (this.consume("]")) return;
      this.expect(",");
      this.skipWhitespace();
    }
  }

  private readString(): string {
    if (this.text[this.position] !== "\"") {
      throw new InvalidJsonBodyError("invalid JSON object key");
    }
    const start = this.position;
    this.skipString();
    const key = JSON.parse(this.text.slice(start, this.position)) as unknown;
    if (typeof key !== "string") {
      throw new InvalidJsonBodyError("invalid JSON object key");
    }
    return key;
  }

  private requireDepth(depth: number): void {
    if (depth > MAX_JSON_DEPTH) {
      throw new InvalidJsonBodyError("JSON nesting is too deep");
    }
  }

  private skipString(): void {
    this.expect("\"");
    while (this.position < this.text.length) {
      const current = this.text.charCodeAt(this.position);
      if (current === 0x22) {
        this.position += 1;
        return;
      }
      if (current < 0x20) {
        throw new InvalidJsonBodyError("invalid control character in JSON string");
      }
      if (current === 0x5c) {
        this.position += 1;
        const escape = this.text[this.position];
        if (escape === "u") {
          const digits = this.text.slice(this.position + 1, this.position + 5);
          if (digits.length !== 4 || ![...digits].every((digit) =>
            (digit >= "0" && digit <= "9")
            || (digit >= "a" && digit <= "f")
            || (digit >= "A" && digit <= "F")
          )) {
            throw new InvalidJsonBodyError("invalid Unicode escape in JSON string");
          }
          this.position += 5;
          continue;
        }
        if (!escape || !"\"\\/bfnrt".includes(escape)) {
          throw new InvalidJsonBodyError("invalid escape in JSON string");
        }
      }
      this.position += 1;
    }
    throw new InvalidJsonBodyError("unterminated JSON string");
  }

  private skipWhitespace(): void {
    while (this.isWhitespace(this.text[this.position])) this.position += 1;
  }

  private isWhitespace(character: string | undefined): boolean {
    return character === " " || character === "\t"
      || character === "\n" || character === "\r";
  }

  private consume(character: string): boolean {
    if (this.text[this.position] !== character) return false;
    this.position += 1;
    return true;
  }

  private expect(character: string): void {
    if (!this.consume(character)) {
      throw new InvalidJsonBodyError(`expected ${character} in JSON`);
    }
  }

  private expectEnd(): void {
    if (this.position !== this.text.length) {
      throw new InvalidJsonBodyError("unexpected content after JSON object");
    }
  }
}

export function parseOrderedTopLevelObject(text: string): OrderedTopLevelObject {
  if (text.length > MAX_RESPONSE_BYTES
    || new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new InvalidJsonBodyError("JSON response is too large");
  }

  let firstToken: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== " " && character !== "\t"
      && character !== "\n" && character !== "\r") {
      firstToken = character;
      break;
    }
  }
  if (firstToken !== "{") {
    try {
      JSON.parse(text);
    } catch {
      throw new InvalidJsonBodyError("invalid JSON");
    }
    throw new NonObjectJsonError("top-level JSON value must be an object");
  }

  const keys = new TopLevelKeyScanner(text).scan();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new InvalidJsonBodyError("invalid JSON");
  }
  if (!isPlainRecord(parsed)) {
    throw new NonObjectJsonError("top-level JSON value must be an object");
  }

  return {
    keys,
    values: parsed,
  };
}

async function loadOrderedSteamSpyObject(
  url: URL,
  request: DiscoveryRequest,
): Promise<FetchResult<OrderedTopLevelObject>> {
  let previousFailure: string | null = null;
  for (let attempt = 1; attempt <= MAX_EXTERNAL_ATTEMPTS; attempt += 1) {
    try {
      const response = await request(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {"User-Agent": "game-player-lens/0.1"},
      });
      if (!response.ok) {
        const cause = `HTTP ${response.status}`;
        const delayMs = externalRetryAfterMs(response);
        if (
          attempt < MAX_EXTERNAL_ATTEMPTS
          && isTransientHttpStatus(response.status)
          && (delayMs === null || delayMs <= MAX_EXTERNAL_RETRY_AFTER_MS)
        ) {
          previousFailure = cause;
          await response.body?.cancel().catch(() => undefined);
          await waitForExternalRetry(delayMs ?? DEFAULT_EXTERNAL_RETRY_DELAY_MS);
          continue;
        }
        if (
          attempt < MAX_EXTERNAL_ATTEMPTS
          && isTransientHttpStatus(response.status)
          && delayMs !== null
          && delayMs > MAX_EXTERNAL_RETRY_AFTER_MS
        ) {
          await response.body?.cancel().catch(() => undefined);
          return {
            data: null,
            warnings: [
              `${STEAMSPY_SOURCE} ${cause}; retry after ${Math.ceil(delayMs / 1_000)}s`,
            ],
          };
        }
        await response.body?.cancel().catch(() => undefined);
        return {
          data: null,
          warnings: [externalFailureWarning(STEAMSPY_SOURCE, cause, attempt)],
        };
      }

      try {
        const text = await readBoundedJsonBody(response);
        return {
          data: parseOrderedTopLevelObject(text),
          warnings: previousFailure
            ? [`${STEAMSPY_SOURCE} recovered after ${previousFailure} on attempt ${attempt}`]
            : [],
        };
      } catch (error) {
        if (error instanceof ResponseBodyTooLargeError) {
          return {data: null, warnings: [`${STEAMSPY_SOURCE} response too large`]};
        }
        const cause = error instanceof NonObjectJsonError
          ? "returned an invalid response"
          : error instanceof InvalidJsonBodyError || error instanceof SyntaxError
            ? "invalid JSON"
            : null;
        if (cause === "returned an invalid response") {
          return {data: null, warnings: [`${STEAMSPY_SOURCE} ${cause}`]};
        }
        if (cause !== null) {
          if (attempt === MAX_EXTERNAL_ATTEMPTS) {
            return {
              data: null,
              warnings: [externalFailureWarning(STEAMSPY_SOURCE, cause, attempt)],
            };
          }
          previousFailure = cause;
          await response.body?.cancel().catch(() => undefined);
          await waitForExternalRetry();
          continue;
        }
        throw error;
      }
    } catch (error) {
      if (isExternalTimeout(error)) {
        return {data: null, warnings: [`${STEAMSPY_SOURCE} timeout`]};
      }
      const cause = "unreachable";
      if (attempt === MAX_EXTERNAL_ATTEMPTS) {
        return {
          data: null,
          warnings: [externalFailureWarning(STEAMSPY_SOURCE, cause, attempt)],
        };
      }
      previousFailure = cause;
      await waitForExternalRetry();
    }
  }

  return {
    data: null,
    warnings: [
      `${STEAMSPY_SOURCE} unreachable after ${MAX_EXTERNAL_ATTEMPTS} attempts`,
    ],
  };
}

function resolveInput(input: DiscoveryInput): DiscoveryQuery {
  if (!isPlainRecord(input)) {
    throw new TypeError("input must be an object");
  }
  if (input.kind !== "tag" && input.kind !== "genre") {
    throw new TypeError("kind must be tag or genre");
  }
  if (typeof input.value !== "string") {
    throw new TypeError("value must be a string");
  }
  const value = input.value.trim();
  if (value.length < 1 || value.length > 80) {
    throw new TypeError("value must be between 1 and 80 characters");
  }
  if (
    input.additionalValues !== undefined
    && (!Array.isArray(input.additionalValues)
      || input.additionalValues.length > MAX_ADDITIONAL_VALUES)
  ) {
    throw new TypeError(`additionalValues must contain at most ${MAX_ADDITIONAL_VALUES} values`);
  }
  const seenValues = new Set([value.toLowerCase()]);
  const additionalValues: string[] = [];
  for (const rawValue of input.additionalValues ?? []) {
    if (typeof rawValue !== "string") {
      throw new TypeError("additionalValues entries must be strings");
    }
    const normalized = rawValue.trim();
    if (normalized.length < 1 || normalized.length > 80) {
      throw new TypeError("additionalValues entries must be between 1 and 80 characters");
    }
    const key = normalized.toLowerCase();
    if (seenValues.has(key)) continue;
    seenValues.add(key);
    additionalValues.push(normalized);
  }
  if (
    input.excludeAppids !== undefined
    && (!Array.isArray(input.excludeAppids)
      || input.excludeAppids.length > MAX_EXCLUDED_APPIDS)
  ) {
    throw new TypeError(`excludeAppids must contain at most ${MAX_EXCLUDED_APPIDS} appids`);
  }
  const excludeAppids: number[] = [];
  const seenAppids = new Set<number>();
  for (const appid of input.excludeAppids ?? []) {
    if (!Number.isSafeInteger(appid) || appid <= 0) {
      throw new TypeError("excludeAppids entries must be positive safe integers");
    }
    if (seenAppids.has(appid)) continue;
    seenAppids.add(appid);
    excludeAppids.push(appid);
  }
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new TypeError("limit must be an integer between 1 and 50");
  }
  return {
    kind: input.kind,
    value,
    ...(additionalValues.length > 0 ? {additionalValues} : {}),
    ...(excludeAppids.length > 0 ? {excludeAppids} : {}),
    limit,
  };
}

function positiveSafeInteger(value: unknown): number | null {
  const parsed = strictFiniteNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function nonNegativeSafeInteger(value: unknown): number | null {
  const parsed = strictFiniteNumber(value);
  if (parsed === null || !Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed === 0 ? 0 : parsed;
}

function normalizeCandidate(
  key: string,
  value: unknown,
  rank: number,
): DiscoveryCandidate | null {
  const appid = positiveSafeInteger(key);
  if (appid === null || !isPlainRecord(value)) return null;

  if (Object.prototype.hasOwnProperty.call(value, "appid")) {
    const rawAppid = positiveSafeInteger(value.appid);
    if (rawAppid === null || rawAppid !== appid) return null;
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) return null;

  const owners = typeof value.owners === "string" && value.owners.trim()
    ? value.owners.trim()
    : null;
  const ccu = nonNegativeSafeInteger(value.ccu);
  const positive = nonNegativeSafeInteger(value.positive);
  const negative = nonNegativeSafeInteger(value.negative);
  const total = positive !== null && negative !== null
    ? positive + negative
    : 0;
  const positivePercent = positive !== null
      && negative !== null
      && Number.isSafeInteger(total)
      && total > 0
    ? Math.round((positive / total) * 100)
    : null;

  return {
    rank,
    appid,
    name,
    owners,
    ccu,
    positive,
    negative,
    positivePercent,
  };
}

function methodologyFor(query: DiscoveryQuery): DiscoveryMethodology {
  if (!query.additionalValues?.length) return {...METHODOLOGY};
  return {
    ...METHODOLOGY,
    ranking: "Candidates were intersected across every requested value and ranked by ascending sum of their SteamSpy API positions; ties retain primary-value order.",
    matching: "Every candidate matched the primary value and every additional value.",
    pool: `Intersection uses the first ${INTERSECTION_POOL_LIMIT} valid SteamSpy entries for each value.`,
  };
}

function metadata(
  observedAt: string,
  query: DiscoveryQuery,
  methodology: DiscoveryMethodology,
): FetchMeta {
  return {
    observedAt,
    sources: [{
      name: "SteamSpy",
      homepage: STEAMSPY_ABOUT,
      notes: "SteamSpy figures are estimates; recent and small-sample games may be unreliable.",
    }],
    request: {...query},
    methodology: {...methodology} as Record<string, JsonValue>,
  };
}

function normalizePool(
  data: OrderedTopLevelObject,
  limit: number,
): {candidates: DiscoveryCandidate[]; invalidCount: number} {
  const candidates: DiscoveryCandidate[] = [];
  let invalidCount = 0;
  for (const [index, key] of data.keys.entries()) {
    const candidate = normalizeCandidate(key, data.values[key], index + 1);
    if (candidate === null) {
      invalidCount += 1;
    } else if (candidates.length < limit) {
      candidates.push(candidate);
    }
  }
  return {candidates, invalidCount};
}

export function createDiscoveryFetcher(
  dependencies: DiscoveryDependencies = {},
): (input: DiscoveryInput) => Promise<FetchResult<DiscoveryResult>> {
  const now = dependencies.now ?? (() => new Date());
  const request = dependencies.request ?? ((url, init) => fetch(url, init));

  return async (input: DiscoveryInput) => {
    const query = resolveInput(input);
    const observed = now();
    if (Number.isNaN(observed.getTime())) {
      throw new TypeError("now must be valid");
    }
    const observedAt = observed.toISOString();
    const methodology = methodologyFor(query);
    const meta = metadata(observedAt, query, methodology);
    const values = [query.value, ...(query.additionalValues ?? [])];
    const fetched = await Promise.all(values.map(async (value) => {
      const url = new URL(STEAMSPY_API);
      url.searchParams.set("request", query.kind);
      url.searchParams.set(query.kind, value);
      return loadOrderedSteamSpyObject(url, request);
    }));
    const warnings = [...new Set(fetched.flatMap((result) => result.warnings))];
    if (fetched.some((result) => result.data === null)) {
      if (values.length > 1) {
        warnings.push(
          `${STEAMSPY_SOURCE} intersection unavailable because one or more value requests failed`,
        );
      }
      return {data: null, warnings, meta};
    }

    const poolLimit = values.length > 1 || (query.excludeAppids?.length ?? 0) > 0
      ? INTERSECTION_POOL_LIMIT
      : query.limit;
    const pools = fetched.map((result) =>
      normalizePool(result.data!, poolLimit));
    const invalidCount = pools.reduce((total, pool) => total + pool.invalidCount, 0);
    const excluded = new Set(query.excludeAppids ?? []);
    let candidates: DiscoveryCandidate[];
    if (values.length === 1) {
      candidates = pools[0]!.candidates
        .filter((candidate) => !excluded.has(candidate.appid))
        .slice(0, query.limit);
    } else {
      const secondaryByAppid = pools.slice(1).map((pool) =>
        new Map(pool.candidates.map((candidate) => [candidate.appid, candidate])));
      candidates = pools[0]!.candidates
        .filter((candidate) =>
          !excluded.has(candidate.appid)
          && secondaryByAppid.every((pool) => pool.has(candidate.appid)))
        .map((candidate) => {
          const sourceRanks = Object.fromEntries([
            [values[0]!, candidate.rank],
            ...secondaryByAppid.map((pool, index) => [
              values[index + 1]!,
              pool.get(candidate.appid)!.rank,
            ] as const),
          ]);
          return {
            ...candidate,
            matchedValues: [...values],
            sourceRanks,
          };
        })
        .sort((left, right) => {
          const leftTotal = Object.values(left.sourceRanks).reduce((sum, rank) => sum + rank, 0);
          const rightTotal = Object.values(right.sourceRanks).reduce((sum, rank) => sum + rank, 0);
          return leftTotal - rightTotal || left.rank - right.rank || left.appid - right.appid;
        })
        .slice(0, query.limit)
        .map((candidate, index) => ({...candidate, rank: index + 1}));
    }

    if (invalidCount > 0) {
      warnings.push(`${STEAMSPY_SOURCE} skipped ${invalidCount} invalid entries`);
    }
    if (candidates.length === 0) {
      warnings.push(`${STEAMSPY_SOURCE} returned no candidates`);
    }

    return {
      data: {
        query,
        observedAt,
        candidates,
        methodology,
      },
      warnings,
      meta,
    };
  };
}

export const discoverGames = createDiscoveryFetcher();
export default discoverGames;
