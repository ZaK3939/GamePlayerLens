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

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {"User-Agent": "game-player-lens/0.1"},
    });

    if (!response.ok) {
      return {data: null, warnings: [`${source} HTTP ${response.status}`]};
    }

    try {
      return {data: (await response.json()) as T, warnings: []};
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {data: null, warnings: [`${source} invalid JSON`]};
      }
      throw error;
    }
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      data: null,
      warnings: [`${source} ${isTimeout ? "timeout" : "unreachable"}`],
    };
  }
}
