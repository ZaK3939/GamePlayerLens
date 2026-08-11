import {createServer} from "node:net";
import {spawn as nodeSpawn, type ChildProcessByStdio} from "node:child_process";
import {once} from "node:events";
import {unlink} from "node:fs/promises";
import type {Readable} from "node:stream";
import {
  connect as puppeteerConnect,
  type Browser,
  type ConnectOptions,
} from "puppeteer-core";
import {
  resolveCapturePath,
  type PathResolver,
} from "./paths.js";
import type {FetchResult} from "./http.js";

const CONNECT_TIMEOUT_MS = 8_000;
const NAVIGATION_TIMEOUT_MS = 15_000;
const DEFAULT_VIEWPORT = {width: 1440, height: 900};
const MANUAL_FALLBACK = "knowledge/ui-references/";

export interface CaptureOptions {
  name?: string;
  viewport?: {width: number; height: number};
  fullPage?: boolean;
}

export interface CaptureResult {
  path: string;
  url: string;
  capturedAt: string;
}

export interface NormalizedCaptureRequest {
  path: string;
  url: string;
  viewport: {width: number; height: number};
  fullPage: boolean;
}

type BrowserConnector = (options: ConnectOptions) => Promise<Browser>;
type CaptureChild = ChildProcessByStdio<null, Readable, Readable>;
type ProcessSpawner = (
  command: string,
  args: string[],
) => CaptureChild;

export interface CaptureDependencies {
  resolver?: Pick<PathResolver, "resolveCapturePath">;
  obscuraPath?: string;
  now?: () => Date;
  connect?: BrowserConnector;
  spawn?: ProcessSpawner;
  findPort?: () => Promise<number>;
}

function defaultResolver(): Pick<PathResolver, "resolveCapturePath"> {
  return {resolveCapturePath};
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
): (url: string, opts?: CaptureOptions) => Promise<FetchResult<CaptureResult>> {
  const resolver = dependencies.resolver ?? defaultResolver();
  const now = dependencies.now ?? (() => new Date());
  const connect = dependencies.connect ?? puppeteerConnect;
  const spawn = dependencies.spawn
    ?? ((command, args) => nodeSpawn(command, args, {stdio: ["ignore", "pipe", "pipe"]}));
  const findPort = dependencies.findPort ?? findLoopbackPort;

  return async (url: string, opts: CaptureOptions = {}) => {
    const request = normalizeCaptureRequest(url, opts, resolver);
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
    try {
      const port = await findPort();
      const runningChild = spawn(obscuraPath, obscuraServeArgs(request.url, port));
      child = runningChild;
      runningChild.once("error", (error) => {
        spawnError = error;
      });

      let bufferedLogs = "";
      const absorbLog = (chunk: Buffer) => {
        bufferedLogs = `${bufferedLogs}${chunk.toString("utf8")}`.slice(-4_096);
      };
      runningChild.stdout.on("data", absorbLog);
      runningChild.stderr.on("data", absorbLog);

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

      const capturedAt = now();
      if (Number.isNaN(capturedAt.getTime())) throw new Error("capture clock is invalid");
      return {
        data: {path: request.path, url: request.url, capturedAt: capturedAt.toISOString()},
        warnings: [],
      };
    } catch {
      await unlink(request.path).catch(() => undefined);
      return {data: null, warnings: [captureFailureWarning()]};
    } finally {
      browser?.disconnect();
      if (child) await stopChild(child);
    }
  };
}

export const captureUrl = createCaptureService();
