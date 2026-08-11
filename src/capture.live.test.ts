import {stat, unlink} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {captureUrl} from "./capture.js";

const canCapture =
  process.env.RUN_LIVE === "1" && Boolean((process.env.OBSCURA_PATH ?? "").trim());

describe.runIf(canCapture)("UI capture (live Obscura)", () => {
  it("captures example.com to a non-empty PNG in the allowed root", async () => {
    const result = await captureUrl("https://example.com", {name: "live-example"});
    const path = result.data?.path;
    expect(path).toContain("knowledge/intel/captures/");
    expect(path).toMatch(/\.png$/);
    expect((await stat(path!)).size).toBeGreaterThan(0);
    await unlink(path!);
  }, 30_000);
});
