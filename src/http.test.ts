import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { fetchJson } from "./http.js";

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

  it("returns a source-scoped warning for non-2xx responses", async () => {
    const url = await listen((_req, res) => {
      res.statusCode = 503;
      res.end("unavailable");
    });

    const result = await fetchJson(url, {source: "test-api"});
    expect(result.data).toBeNull();
    expect(result.warnings).toEqual(["test-api HTTP 503"]);
  });

  it("returns a warning for invalid JSON", async () => {
    const url = await listen((_req, res) => res.end("not-json"));

    const result = await fetchJson(url, {source: "test-api"});
    expect(result.data).toBeNull();
    expect(result.warnings.join()).toContain("invalid JSON");
  });

  it("times out without throwing", async () => {
    const url = await listen(() => undefined);

    const result = await fetchJson(url, {source: "test-api", timeoutMs: 20});
    expect(result.data).toBeNull();
    expect(result.warnings).toEqual(["test-api timeout"]);
  });
});
