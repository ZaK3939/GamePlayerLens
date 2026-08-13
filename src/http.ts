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
import {readBoundedJsonBody, ResponseBodyTooLargeError} from "./response-body.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {[key: string]: JsonValue};

export interface FetchSource {
  name: string;
  homepage?: string;
  notes?: string;
}

export interface FetchMeta {
  observedAt?: string;
  sources?: FetchSource[];
  request?: JsonValue;
  methodology?: JsonValue;
  resultHandle?: string;
}

export interface FetchResult<T> {
  data: T | null;
  warnings: string[];
  meta?: FetchMeta;
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  source?: string;
}

function sourceName(url: string | URL, source?: string): string {
  if (source) return source;
  try {
    return new URL(url).host;
  } catch {
    return "request";
  }
}

export async function fetchJson<T>(
  url: string | URL,
  opts: FetchJsonOptions = {},
): Promise<FetchResult<T>> {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const source = sourceName(url, opts.source);
  let previousFailure: string | null = null;

  for (let attempt = 1; attempt <= MAX_EXTERNAL_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
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
            warnings: [`${source} ${cause}; retry after ${Math.ceil(delayMs / 1_000)}s`],
          };
        }
        await response.body?.cancel().catch(() => undefined);
        return {data: null, warnings: [externalFailureWarning(source, cause, attempt)]};
      }

      try {
        const data = JSON.parse(await readBoundedJsonBody(response)) as T;
        return {
          data,
          warnings: previousFailure
            ? [`${source} recovered after ${previousFailure} on attempt ${attempt}`]
            : [],
        };
      } catch (error) {
        if (isExternalTimeout(error)) {
          return {data: null, warnings: [`${source} timeout`]};
        }
        if (error instanceof ResponseBodyTooLargeError) {
          return {data: null, warnings: [`${source} response too large`]};
        }
        const cause = error instanceof SyntaxError ? "invalid JSON" : "unreachable";
        if (attempt === MAX_EXTERNAL_ATTEMPTS) {
          return {data: null, warnings: [externalFailureWarning(source, cause, attempt)]};
        }
        previousFailure = cause;
        await waitForExternalRetry();
      }
    } catch (error) {
      if (isExternalTimeout(error)) {
        return {data: null, warnings: [`${source} timeout`]};
      }
      const cause = "unreachable";
      if (attempt === MAX_EXTERNAL_ATTEMPTS) {
        return {data: null, warnings: [externalFailureWarning(source, cause, attempt)]};
      }
      previousFailure = cause;
      await waitForExternalRetry();
    }
  }

  return {
    data: null,
    warnings: [`${source} unreachable after ${MAX_EXTERNAL_ATTEMPTS} attempts`],
  };
}
