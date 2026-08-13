export const MAX_EXTERNAL_ATTEMPTS = 2;
export const DEFAULT_EXTERNAL_RETRY_DELAY_MS = 100;
export const MAX_EXTERNAL_RETRY_AFTER_MS = 1_000;

export function isExternalTimeout(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function isTransientHttpStatus(status: number): boolean {
  return status === 408
    || status === 425
    || status === 429
    || (status >= 500 && status <= 599);
}

export function externalRetryAfterMs(response: Response): number | null {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds * 1_000 : Number.MAX_SAFE_INTEGER;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export function externalFailureWarning(
  source: string,
  cause: string,
  attempts: number,
): string {
  return `${source} ${cause}${attempts > 1 ? ` after ${attempts} attempts` : ""}`;
}

export async function waitForExternalRetry(
  delayMs = DEFAULT_EXTERNAL_RETRY_DELAY_MS,
): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
