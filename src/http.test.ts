import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import * as httpModule from "./http.js";
import {
  fetchJson,
  type FetchMeta,
  type FetchResult,
  type JsonValue,
} from "./http.js";

const servers: Server[] = [];

async function listen(
  handler: Parameters<typeof createServer>[0],
): Promise<URL> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  return new URL(`http://127.0.0.1:${address.port}/`);
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

describe("FetchResult", () => {
  it("keeps data-and-warnings-only results compatible", () => {
    const result = {
      data: {appid: 1145360},
      warnings: [],
    } satisfies FetchResult<{appid: number}>;

    expect(result).toEqual({data: {appid: 1145360}, warnings: []});
    expect("meta" in result).toBe(false);
  });

  it("holds JSON-safe provenance metadata", () => {
    const meta = {
      observedAt: "2026-08-11T12:34:56.000Z",
      sources: [{
        name: "Steam Store",
        homepage: "https://store.steampowered.com/",
        notes: "Public store metadata",
      }],
      request: {countries: ["JP", "US"], includeReviews: false},
      methodology: {strategy: "regional-snapshot", representative: false},
    } satisfies FetchMeta;
    const result: FetchResult<{appid: number}> = {
      data: {appid: 1145360},
      warnings: [],
      meta,
    };

    const roundTripped = JSON.parse(JSON.stringify(result)) as JsonValue;
    expect(roundTripped).toEqual(result);
  });

  it("does not expose a metadata helper that could accept secrets or request URLs", () => {
    expect(Object.keys(httpModule)).toEqual(["fetchJson"]);
  });
});

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    const url = await listen((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({appid: 1145360}));
    });

    await expect(fetchJson<{appid: number}>(url)).resolves.toEqual({
      data: {appid: 1145360},
      warnings: [],
    });
  });

  it("returns a source-scoped warning for non-retryable responses", async () => {
    let requests = 0;
    const url = await listen((_req, res) => {
      requests += 1;
      res.statusCode = 404;
      res.end("unavailable");
    });

    const result = await fetchJson(url, {source: "test-api"});
    expect(result.data).toBeNull();
    expect(result.warnings).toEqual(["test-api HTTP 404"]);
    expect(requests).toBe(1);
  });

  it("recovers once from a short transient HTTP failure", async () => {
    let requests = 0;
    const url = await listen((_req, res) => {
      requests += 1;
      if (requests === 1) {
        res.statusCode = 503;
        res.setHeader("Retry-After", "0");
        res.end("temporarily unavailable");
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({appid: 1145360}));
    });

    await expect(fetchJson<{appid: number}>(url, {source: "test-api"})).resolves.toEqual({
      data: {appid: 1145360},
      warnings: ["test-api recovered after HTTP 503 on attempt 2"],
    });
    expect(requests).toBe(2);
  });

  it("bounds repeated transient failures to two attempts", async () => {
    let requests = 0;
    const url = await listen((_req, res) => {
      requests += 1;
      res.statusCode = 429;
      res.setHeader("Retry-After", "0");
      res.end("rate limited with secret request details");
    });

    const result = await fetchJson(url, {source: "test-api"});
    expect(result).toEqual({
      data: null,
      warnings: ["test-api HTTP 429 after 2 attempts"],
    });
    expect(requests).toBe(2);
    expect(result.warnings.join(" ")).not.toContain("secret request details");
  });

  it("does not sleep through a long Retry-After window", async () => {
    let requests = 0;
    const url = await listen((_req, res) => {
      requests += 1;
      res.statusCode = 429;
      res.setHeader("Retry-After", "120");
      res.end("rate limited");
    });

    const startedAt = Date.now();
    const result = await fetchJson(url, {source: "test-api"});
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(result).toEqual({
      data: null,
      warnings: ["test-api HTTP 429; retry after 120s"],
    });
    expect(requests).toBe(1);
  });

  it("retries invalid JSON once before returning a warning", async () => {
    let requests = 0;
    const url = await listen((_req, res) => {
      requests += 1;
      res.end("not-json");
    });

    const result = await fetchJson(url, {source: "test-api"});
    expect(result.data).toBeNull();
    expect(result.warnings).toEqual(["test-api invalid JSON after 2 attempts"]);
    expect(requests).toBe(2);
  });

  it("recovers from a connection reset without exposing the request URL", async () => {
    let requests = 0;
    const url = await listen((req, res) => {
      requests += 1;
      if (requests === 1) {
        req.socket.destroy();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ok: true}));
    });

    const result = await fetchJson<{ok: boolean}>(url, {source: "test-api"});
    expect(result).toEqual({
      data: {ok: true},
      warnings: ["test-api recovered after unreachable on attempt 2"],
    });
    expect(result.warnings.join(" ")).not.toContain(url.toString());
    expect(requests).toBe(2);
  });

  it("times out without throwing", async () => {
    const url = await listen(() => undefined);

    const result = await fetchJson(url, {source: "test-api", timeoutMs: 20});
    expect(result.data).toBeNull();
    expect(result.warnings).toEqual(["test-api timeout"]);
  });
});
