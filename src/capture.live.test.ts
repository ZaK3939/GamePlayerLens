import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {unlink} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {captureUrl} from "./capture.js";

const runLive = process.env.RUN_LIVE === "1";
const obscuraConfigured = Boolean((process.env.OBSCURA_PATH ?? "").trim());

describe.runIf(runLive && !obscuraConfigured)("UI capture (live contract, Obscura unset)", () => {
  it("returns the manual ui-reference fallback without creating a capture", async () => {
    const result = await captureUrl("http://127.0.0.1:1", {name: "live-unconfigured"});

    expect(result.data).toBeNull();
    expect(result.imageContent).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("knowledge/ui-references/");
  });
});

describe.runIf(runLive && obscuraConfigured)("UI capture (live Obscura)", () => {
  it("captures localhost and returns standard MCP ImageContent", async () => {
    const origin = createServer((_request, response) => {
      response.writeHead(200, {"content-type": "text/html; charset=utf-8"});
      response.end("<!doctype html><title>Steam user sim capture</title><h1>Local UI</h1>");
    });
    await new Promise<void>((resolve, reject) => {
      origin.once("error", reject);
      origin.listen(0, "127.0.0.1", resolve);
    });
    const port = (origin.address() as AddressInfo).port;
    let artifactPath: string | undefined;

    try {
      const result = await captureUrl(`http://127.0.0.1:${port}`, {
        name: "live-localhost-image-content",
      });
      artifactPath = result.data?.path;

      expect(artifactPath).toContain("knowledge/intel/captures/");
      expect(artifactPath).toMatch(/\.png$/);
      expect(result.data).toMatchObject({imageIncluded: true, sizeBytes: expect.any(Number)});
      expect(result.imageContent).toMatchObject({
        type: "image",
        mimeType: "image/png",
        data: expect.any(String),
      });
      expect(Buffer.from(result.imageContent!.data, "base64").subarray(0, 8))
        .toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    } finally {
      await new Promise<void>((resolve, reject) => {
        origin.close((error) => error ? reject(error) : resolve());
      });
      if (artifactPath) await unlink(artifactPath);
    }
  }, 30_000);
});
