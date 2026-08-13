export const MAX_JSON_RESPONSE_BYTES = 8 * 1024 * 1024;

export class ResponseBodyTooLargeError extends Error {}

function declaredContentLength(response: Response): number | null {
  const value = response.headers.get("content-length")?.trim();
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function decodeUtf8(
  decoder: TextDecoder,
  bytes?: Uint8Array,
  stream = false,
): string {
  try {
    return bytes === undefined
      ? decoder.decode()
      : decoder.decode(bytes, {stream});
  } catch {
    throw new SyntaxError("response is not valid UTF-8");
  }
}

export async function readBoundedJsonBody(response: Response): Promise<string> {
  const contentLength = declaredContentLength(response);
  if (contentLength !== null && contentLength > MAX_JSON_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResponseBodyTooLargeError("JSON response is too large");
  }
  if (response.body === null) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", {fatal: true});
  const chunks: string[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_JSON_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ResponseBodyTooLargeError("JSON response is too large");
      }
      chunks.push(decodeUtf8(decoder, value, true));
    }
    chunks.push(decodeUtf8(decoder));
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}
