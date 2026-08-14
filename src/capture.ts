import {createServer} from "node:net";
import {spawn as nodeSpawn, type ChildProcessByStdio} from "node:child_process";
import {once} from "node:events";
import {open, unlink} from "node:fs/promises";
import {basename} from "node:path";
import type {Readable} from "node:stream";
import {
  connect as puppeteerConnect,
  type Browser,
  type ConnectOptions,
} from "puppeteer-core";
import type {ImageFetchResult} from "./images.js";
import {MAX_INLINE_IMAGE_BYTES, createImageService} from "./images.js";
import {
  resolveCapturePath,
  resolveCaptureReadPath,
  resolveUiReferencePath,
  type PathResolver,
} from "./paths.js";

const CONNECT_TIMEOUT_MS = 8_000;
const NAVIGATION_TIMEOUT_MS = 15_000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 8_000;
const DEFAULT_VIEWPORT = {width: 1440, height: 900};
const MANUAL_FALLBACK = "knowledge/ui-references/";

export interface CaptureOptions {
  name?: string;
  viewport?: {width: number; height: number};
  fullPage?: boolean;
  sourceType?: CaptureSourceType;
}

export type CaptureSourceType = "page" | "steam-image";

export interface CaptureResult {
  id: string;
  path: string;
  relativePath: string;
  url: string;
  capturedAt: string;
  imageIncluded: boolean;
  sizeBytes: number;
  sourceType: CaptureSourceType;
}

export interface NormalizedCaptureRequest {
  path: string;
  url: string;
  viewport: {width: number; height: number};
  fullPage: boolean;
  sourceType: CaptureSourceType;
}

type BrowserConnector = (options: ConnectOptions) => Promise<Browser>;
type CaptureChild = ChildProcessByStdio<null, Readable, Readable>;
type ProcessSpawner = (
  command: string,
  args: string[],
) => CaptureChild;

export interface CaptureDependencies {
  resolver?: Pick<
    PathResolver,
    "resolveCapturePath" | "resolveCaptureReadPath" | "resolveUiReferencePath"
  >;
  obscuraPath?: string;
  now?: () => Date;
  connect?: BrowserConnector;
  spawn?: ProcessSpawner;
  findPort?: () => Promise<number>;
  fetchImage?: typeof fetch;
}

function defaultResolver(): Pick<
  PathResolver,
  "resolveCapturePath" | "resolveCaptureReadPath" | "resolveUiReferencePath"
> {
  return {resolveCapturePath, resolveCaptureReadPath, resolveUiReferencePath};
}

function validViewport(viewport: {width: number; height: number}): boolean {
  return Number.isInteger(viewport.width)
    && Number.isInteger(viewport.height)
    && viewport.width >= 320
    && viewport.width <= 3840
    && viewport.height >= 240
    && viewport.height <= 2160;
}

export function normalizeCaptureRequest(
  value: string,
  opts: CaptureOptions = {},
  resolver: Pick<PathResolver, "resolveCapturePath"> = defaultResolver(),
): NormalizedCaptureRequest {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("url must be a valid http or https URL");
  }
  const sourceType = opts.sourceType ?? "page";
  if (sourceType !== "page" && sourceType !== "steam-image") {
    throw new TypeError("sourceType must be page or steam-image");
  }

  if (sourceType === "steam-image") {
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:") {
      throw new TypeError("Steam CDN image URLs must use HTTPS");
    }
    if (url.username || url.password) {
      throw new TypeError("Steam CDN image URLs cannot include credentials");
    }
    if (url.port && url.port !== "443") {
      throw new TypeError("Steam CDN image URLs cannot use a custom port");
    }
    if (hostname !== "steamstatic.com" && !hostname.endsWith(".steamstatic.com")) {
      throw new TypeError("Steam CDN image URLs must use steamstatic.com");
    }
    if (opts.viewport !== undefined || opts.fullPage !== undefined) {
      throw new TypeError("viewport and fullPage apply only to page captures");
    }
    return {
      path: resolver.resolveCapturePath(opts.name, "jpg"),
      url: url.toString(),
      viewport: {...DEFAULT_VIEWPORT},
      fullPage: true,
      sourceType,
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("url must use http or https");
  }

  const viewport = opts.viewport ?? DEFAULT_VIEWPORT;
  if (!validViewport(viewport)) {
    throw new TypeError("viewport must be 320-3840 pixels wide and 240-2160 pixels high");
  }
  if (opts.fullPage !== undefined && typeof opts.fullPage !== "boolean") {
    throw new TypeError("fullPage must be a boolean");
  }

  return {
    path: resolver.resolveCapturePath(opts.name),
    url: url.toString(),
    viewport: {...viewport},
    fullPage: opts.fullPage ?? true,
    sourceType,
  };
}

async function findLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (!address || typeof address === "string") {
    throw new Error("could not allocate a loopback port");
  }
  return address.port;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectWithRetry(
  connect: BrowserConnector,
  endpoint: string,
  processError: () => Error | null,
): Promise<Browser> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const spawnError = processError();
    if (spawnError) throw spawnError;
    try {
      return await connect({browserWSEndpoint: endpoint});
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError instanceof Error
    ? new Error("Obscura CDP did not become ready", {cause: lastError})
    : new Error("Obscura CDP did not become ready");
}

async function stopChild(child: CaptureChild): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(1_000)]).catch(() => undefined);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), delay(1_000)]).catch(() => undefined);
  }
}

function captureFailureWarning(): string {
  return `UI capture failed; place a PNG manually in ${MANUAL_FALLBACK}`;
}

function steamImageFailureWarning(): string {
  return `Steam image download failed; retry or place a PNG manually in ${MANUAL_FALLBACK}`;
}

async function rejectSteamImageResponse(
  response: Response,
  message: string,
): Promise<never> {
  await response.body?.cancel().catch(() => undefined);
  throw new Error(message);
}

async function readBoundedJpeg(response: Response): Promise<Buffer> {
  if (!response.ok) {
    await rejectSteamImageResponse(response, `Steam image HTTP ${response.status}`);
  }
  if (response.redirected) {
    await rejectSteamImageResponse(response, "Steam image redirects are not allowed");
  }
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "image/jpeg") {
    await rejectSteamImageResponse(response, "Steam image response must be image/jpeg");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      await rejectSteamImageResponse(response, "invalid Steam image content length");
    }
    if (Number(contentLength) > MAX_INLINE_IMAGE_BYTES) {
      await rejectSteamImageResponse(
        response,
        "Steam image exceeds the 6 MiB download limit",
      );
    }
  }
  if (!response.body) throw new Error("Steam image response has no body");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > MAX_INLINE_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Steam image exceeds the 6 MiB download limit");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

function isLoopbackUrl(value: string): boolean {
  const hostname = new URL(value).hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "::1"
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function obscuraServeArgs(url: string, port: number): string[] {
  const args = ["serve", "--port", String(port)];
  if (isLoopbackUrl(url)) args.push("--allow-private-network");
  return args;
}

export function createCaptureService(
  dependencies: CaptureDependencies = {},
): (url: string, opts?: CaptureOptions) => Promise<ImageFetchResult<CaptureResult>> {
  const resolver = dependencies.resolver ?? defaultResolver();
  const now = dependencies.now ?? (() => new Date());
  const connect = dependencies.connect ?? puppeteerConnect;
  const spawn = dependencies.spawn
    ?? ((command, args) => nodeSpawn(command, args, {stdio: ["ignore", "pipe", "pipe"]}));
  const findPort = dependencies.findPort ?? findLoopbackPort;
  const fetchImage = dependencies.fetchImage ?? fetch;

  return async (url: string, opts: CaptureOptions = {}) => {
    const request = normalizeCaptureRequest(url, opts, resolver);
    const resultFor = async (extension: "png" | "jpg") => {
      const capturedAt = now();
      if (Number.isNaN(capturedAt.getTime())) throw new Error("capture clock is invalid");
      const id = basename(request.path, `.${extension}`);
      const resolved = resolver.resolveCaptureReadPath(id, extension);
      if (resolved.absolutePath !== request.path) {
        throw new Error("capture output does not match its resolver path");
      }
      const inline = await createImageService(resolver).imageContentFor(resolved);
      return {
        data: {
          id: resolved.id,
          path: request.path,
          relativePath: resolved.relativePath,
          url: request.url,
          capturedAt: capturedAt.toISOString(),
          imageIncluded: inline.imageIncluded,
          sizeBytes: inline.sizeBytes,
          sourceType: request.sourceType,
        },
        warnings: inline.warnings,
        ...(inline.imageContent ? {imageContent: inline.imageContent} : {}),
      } satisfies ImageFetchResult<CaptureResult>;
    };

    if (request.sourceType === "steam-image") {
      let ownsOutput = false;
      try {
        const response = await fetchImage(request.url, {
          headers: {
            Accept: "image/jpeg",
            "User-Agent": "game-player-lens/0.1",
          },
          redirect: "error",
          signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
        });
        const bytes = await readBoundedJpeg(response);
        const output = await open(request.path, "wx", 0o600);
        ownsOutput = true;
        try {
          await output.writeFile(bytes);
          await output.sync();
        } finally {
          await output.close();
        }
        return await resultFor("jpg");
      } catch {
        if (ownsOutput) await unlink(request.path).catch(() => undefined);
        return {data: null, warnings: [steamImageFailureWarning()]};
      }
    }

    const obscuraPath =
      (dependencies.obscuraPath ?? process.env.OBSCURA_PATH ?? "").trim();
    if (!obscuraPath) {
      return {
        data: null,
        warnings: [
          `Obscura is not configured: install it and set OBSCURA_PATH, or place a PNG manually in ${MANUAL_FALLBACK}`,
        ],
      };
    }

    let browser: Browser | null = null;
    let child: CaptureChild | null = null;
    let spawnError: Error | null = null;
    let ownsOutput = false;
    try {
      const reservation = await open(request.path, "wx", 0o600);
      ownsOutput = true;
      await reservation.close();

      const port = await findPort();
      const runningChild = spawn(obscuraPath, obscuraServeArgs(request.url, port));
      child = runningChild;
      runningChild.once("error", (error) => {
        spawnError = error;
      });

      runningChild.stdout.resume();
      runningChild.stderr.resume();

      browser = await connectWithRetry(
        connect,
        `ws://127.0.0.1:${port}/devtools/browser`,
        () => spawnError,
      );
      const page = await browser.newPage();
      await page.setViewport(request.viewport);
      await page.goto(request.url, {
        waitUntil: "networkidle2",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await page.screenshot({
        path: request.path as `${string}.png`,
        type: "png",
        fullPage: request.fullPage,
      });
      const completed = await open(request.path, "r");
      try {
        await completed.sync();
      } finally {
        await completed.close();
      }

      return await resultFor("png");
    } catch {
      if (ownsOutput) await unlink(request.path).catch(() => undefined);
      return {data: null, warnings: [captureFailureWarning()]};
    } finally {
      browser?.disconnect();
      if (child) await stopChild(child);
    }
  };
}

export const captureUrl = createCaptureService();
