import {mkdtemp, mkdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename, join, relative} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {createCaptureService, normalizeCaptureRequest} from "./capture.js";
import {createPathResolver} from "./paths.js";

const roots: string[] = [];

async function tempResolver() {
  const root = await mkdtemp(join(tmpdir(), "steam-user-sim-capture-"));
  roots.push(root);
  await mkdir(join(root, "knowledge", "intel", "captures"), {recursive: true});
  return createPathResolver(root);
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
});

describe("capture service", () => {
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
});
