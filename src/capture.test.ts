import {EventEmitter} from "node:events";
import {access, mkdtemp, mkdir, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename, join, relative} from "node:path";
import {PassThrough} from "node:stream";
import type {Browser} from "puppeteer-core";
import {afterEach, describe, expect, it, vi} from "vitest";
import {createCaptureService, normalizeCaptureRequest} from "./capture.js";
import {createPathResolver} from "./paths.js";

const roots: string[] = [];
const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const STEAM_IMAGE_URL =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145350/ss_hades.jpg";

async function tempResolver() {
  const root = await mkdtemp(join(tmpdir(), "steam-user-sim-capture-"));
  roots.push(root);
  await mkdir(join(root, "knowledge", "intel", "captures"), {recursive: true});
  return createPathResolver(root);
}

async function captureHarness() {
  const resolver = await tempResolver();
  const page = {
    setViewport: vi.fn(async () => undefined),
    goto: vi.fn(async () => undefined),
    screenshot: vi.fn(async (options: {path: string}) => {
      await writeFile(options.path, PNG_BYTES);
    }),
  };
  const browser = {
    newPage: vi.fn(async () => page),
    disconnect: vi.fn(),
  } as unknown as Browser;
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn((signal: NodeJS.Signals) => {
      child.signalCode = signal;
      queueMicrotask(() => child.emit("exit", null, signal));
      return true;
    }),
  });
  const spawn = vi.fn(() => child) as never;
  const connect = vi.fn(async () => browser);
  const capture = createCaptureService({
    resolver,
    obscuraPath: "/opt/obscura",
    now: () => new Date("2026-08-11T00:00:00.000Z"),
    findPort: async () => 9222,
    spawn,
    connect,
  });
  return {capture, spawn, connect, page, browser, child};
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("normalizeCaptureRequest", () => {
  it.each(["file:///etc/passwd", "data:text/plain,x", "javascript:alert(1)"])(
    "rejects unsafe scheme: %s",
    async (url) => {
      const resolver = await tempResolver();
      expect(() => normalizeCaptureRequest(url, {}, resolver)).toThrow(
        /http.*https/i,
      );
    },
  );

  it("keeps traversal-like names inside the capture root", async () => {
    const resolver = await tempResolver();
    const request = normalizeCaptureRequest(
      "https://example.com",
      {name: "../../x"},
      resolver,
    );
    const captureRoot = join(resolver.root, "knowledge", "intel", "captures");

    expect(relative(captureRoot, request.path)).not.toMatch(/^\.\./);
    expect(basename(request.path)).toMatch(/^x-[a-f0-9-]+\.png$/);
  });

  it("uses bounded viewport defaults and full-page capture", async () => {
    const resolver = await tempResolver();
    expect(normalizeCaptureRequest("http://localhost:3000", {}, resolver)).toMatchObject({
      viewport: {width: 1440, height: 900},
      fullPage: true,
    });
    expect(() => normalizeCaptureRequest(
      "https://example.com",
      {viewport: {width: 319, height: 900}},
      resolver,
    )).toThrow(/viewport/);
    expect(() => normalizeCaptureRequest(
      "https://example.com",
      {viewport: {width: 1440, height: 2161}},
      resolver,
    )).toThrow(/viewport/);
  });

  it("allows direct downloads only from the HTTPS Steam image CDN", async () => {
    const resolver = await tempResolver();
    const request = normalizeCaptureRequest(
      STEAM_IMAGE_URL,
      {sourceType: "steam-image", name: "Hades II hero"},
      resolver,
    );
    expect(request).toMatchObject({sourceType: "steam-image", url: STEAM_IMAGE_URL});
    expect(request.path).toMatch(/hades-ii-hero-[a-f0-9-]+\.jpg$/);

    for (const url of [
      STEAM_IMAGE_URL.replace("https:", "http:"),
      "https://steamstatic.com.evil.example/store/shot.jpg",
      "https://user:pass@shared.akamai.steamstatic.com/store/shot.jpg",
      "https://shared.akamai.steamstatic.com:444/store/shot.jpg",
    ]) {
      expect(() => normalizeCaptureRequest(
        url,
        {sourceType: "steam-image"},
        resolver,
      )).toThrow(/Steam CDN|HTTPS|credentials|port/i);
    }
    expect(() => normalizeCaptureRequest(
      STEAM_IMAGE_URL,
      {sourceType: "steam-image", fullPage: true},
      resolver,
    )).toThrow(/viewport|fullPage/i);
  });
});

describe("capture service", () => {
  it("downloads a Steam Store screenshot as JPEG without Obscura", async () => {
    const resolver = await tempResolver();
    const fetchImage = vi.fn(async () => new Response(JPEG_BYTES, {
      status: 200,
      headers: {
        "content-length": String(JPEG_BYTES.length),
        "content-type": "image/jpeg",
      },
    }));
    const spawn = vi.fn();
    const capture = createCaptureService({
      resolver,
      obscuraPath: " ",
      fetchImage,
      spawn: spawn as never,
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    const result = await capture(STEAM_IMAGE_URL, {
      sourceType: "steam-image",
      name: "Hades II store",
    });

    expect(result).toMatchObject({
      data: {
        id: expect.stringMatching(/^hades-ii-store-[a-f0-9-]+$/),
        path: expect.stringMatching(/hades-ii-store-[a-f0-9-]+\.jpg$/),
        relativePath: expect.stringMatching(
          /^knowledge\/intel\/captures\/hades-ii-store-[a-f0-9-]+\.jpg$/,
        ),
        url: STEAM_IMAGE_URL,
        sourceType: "steam-image",
        capturedAt: "2026-08-11T00:00:00.000Z",
        imageIncluded: true,
        sizeBytes: JPEG_BYTES.length,
      },
      warnings: [],
      imageContent: {
        type: "image",
        data: JPEG_BYTES.toString("base64"),
        mimeType: "image/jpeg",
      },
    });
    expect(fetchImage).toHaveBeenCalledWith(STEAM_IMAGE_URL, expect.objectContaining({
      redirect: "error",
      signal: expect.any(AbortSignal),
    }));
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTP failure", new Response(null, {status: 503})],
    ["wrong content type", new Response(JPEG_BYTES, {
      status: 200,
      headers: {"content-type": "text/html"},
    })],
    ["oversized content length", new Response(JPEG_BYTES, {
      status: 200,
      headers: {
        "content-length": String(6 * 1024 * 1024 + 1),
        "content-type": "image/jpeg",
      },
    })],
    ["invalid JPEG", new Response(Buffer.from("not a jpeg"), {
      status: 200,
      headers: {"content-type": "image/jpeg"},
    })],
  ])("cleans its output after Steam image %s", async (_label, response) => {
    const resolver = await tempResolver();
    const captureRoot = join(resolver.root, "knowledge", "intel", "captures");
    await writeFile(join(captureRoot, "existing.png"), PNG_BYTES);
    const capture = createCaptureService({
      resolver,
      obscuraPath: " ",
      fetchImage: vi.fn(async () => response),
    });

    const result = await capture(STEAM_IMAGE_URL, {sourceType: "steam-image"});

    expect(result.data).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/Steam image download failed/i);
    expect(await readdir(captureRoot)).toEqual(["existing.png"]);
  });

  it("enforces the Steam image limit while streaming without Content-Length", async () => {
    const resolver = await tempResolver();
    const captureRoot = join(resolver.root, "knowledge", "intel", "captures");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(JPEG_BYTES);
        controller.enqueue(Buffer.alloc(6 * 1024 * 1024));
        controller.close();
      },
    });
    const capture = createCaptureService({
      resolver,
      fetchImage: vi.fn(async () => new Response(body, {
        headers: {"content-type": "image/jpeg"},
      })),
    });

    const result = await capture(STEAM_IMAGE_URL, {sourceType: "steam-image"});

    expect(result.data).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/Steam image download failed/i);
    expect(await readdir(captureRoot)).toEqual([]);
  });

  it("never deletes a pre-existing path when exclusive Steam image creation fails", async () => {
    const resolver = await tempResolver();
    const existing = resolver.resolveCaptureReadPath("claimed-output", "jpg");
    await writeFile(existing.absolutePath, JPEG_BYTES);
    const capture = createCaptureService({
      resolver: {
        ...resolver,
        resolveCapturePath: () => existing.absolutePath,
      },
      fetchImage: vi.fn(async () => new Response(JPEG_BYTES, {
        headers: {"content-type": "image/jpeg"},
      })),
    });

    const result = await capture(STEAM_IMAGE_URL, {sourceType: "steam-image"});

    expect(result.data).toBeNull();
    await expect(access(existing.absolutePath)).resolves.toBeUndefined();
  });

  it("returns install and manual fallback guidance when Obscura is unset", async () => {
    const capture = createCaptureService({
      resolver: await tempResolver(),
      obscuraPath: " ",
    });
    const result = await capture("https://example.com");

    expect(result.data).toBeNull();
    expect(result.warnings.join(" ")).toContain("OBSCURA_PATH");
    expect(result.warnings.join(" ")).toContain("knowledge/ui-references/");
  });

  it.each([
    ["http://localhost:3000", true],
    ["http://127.0.0.42:3000", true],
    ["http://[::1]:3000", true],
    ["https://example.com", false],
  ] as const)(
    "uses private-network access only for loopback capture: %s",
    async (url, allowsPrivateNetwork) => {
      const {capture, spawn, connect, page, browser, child} = await captureHarness();
      const result = await capture(url, {name: "target"});
      const expectedArgs = ["serve", "--port", "9222"];
      if (allowsPrivateNetwork) expectedArgs.push("--allow-private-network");

      expect(result).toMatchObject({
        data: {
          id: expect.stringMatching(/^target-[a-f0-9-]+$/),
          path: expect.stringMatching(/knowledge[/\\]intel[/\\]captures/),
          relativePath: expect.stringMatching(
            /^knowledge\/intel\/captures\/target-[a-f0-9-]+\.png$/,
          ),
          url: new URL(url).toString(),
          capturedAt: "2026-08-11T00:00:00.000Z",
          imageIncluded: true,
          sizeBytes: PNG_BYTES.length,
        },
        warnings: [],
        imageContent: {
          type: "image",
          data: PNG_BYTES.toString("base64"),
          mimeType: "image/png",
        },
      });
      expect(result.data).not.toHaveProperty("imageContent");
      expect(spawn).toHaveBeenCalledWith("/opt/obscura", expectedArgs);
      expect(connect).toHaveBeenCalledWith({
        browserWSEndpoint: "ws://127.0.0.1:9222/devtools/browser",
      });
      expect(page.goto).toHaveBeenCalledWith(new URL(url).toString(), {
        waitUntil: "networkidle2",
        timeout: 15_000,
      });
      expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({
        type: "png",
        fullPage: true,
      }));
      expect(browser.disconnect).toHaveBeenCalledOnce();
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    },
  );

  it("deletes only its incomplete output and preserves manual fallback guidance", async () => {
    const resolver = await tempResolver();
    const sibling = join(
      resolver.root,
      "knowledge",
      "intel",
      "captures",
      "existing.png",
    );
    await writeFile(sibling, PNG_BYTES);
    let incompletePath = "";
    const page = {
      setViewport: vi.fn(async () => undefined),
      goto: vi.fn(async () => undefined),
      screenshot: vi.fn(async (options: {path: string}) => {
        incompletePath = options.path;
        await writeFile(options.path, PNG_BYTES.subarray(0, 4));
        throw new Error("capture interrupted");
      }),
    };
    const browser = {
      newPage: vi.fn(async () => page),
      disconnect: vi.fn(),
    } as unknown as Browser;
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill: vi.fn((signal: NodeJS.Signals) => {
        child.signalCode = signal;
        queueMicrotask(() => child.emit("exit", null, signal));
        return true;
      }),
    });
    const capture = createCaptureService({
      resolver,
      obscuraPath: "/opt/obscura",
      findPort: async () => 9222,
      spawn: vi.fn(() => child) as never,
      connect: vi.fn(async () => browser),
    });

    const result = await capture("https://example.com", {name: "partial"});

    expect(result).toEqual({
      data: null,
      warnings: [expect.stringMatching(/knowledge\/ui-references\//)],
    });
    await expect(access(incompletePath)).rejects.toThrow();
    await expect(access(sibling)).resolves.toBeUndefined();
  });
});
