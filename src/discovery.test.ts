import {describe, expect, it, vi} from "vitest";
import {
  createDiscoveryFetcher,
  parseOrderedTopLevelObject,
} from "./discovery.js";

const NOW = new Date("2026-08-11T12:34:56.000Z");

function game(appid: number, name: string, overrides: Record<string, unknown> = {}) {
  return {
    appid,
    name,
    owners: "100,000 .. 200,000",
    ccu: 100,
    positive: 90,
    negative: 10,
    ...overrides,
  };
}

function orderedObject(entries: Array<[string, unknown]>): string {
  return `{${entries.map(([key, value]) =>
    `${JSON.stringify(key)}:${JSON.stringify(value)}`
  ).join(",")}}`;
}

function requestRaw(body: string, status = 200) {
  return vi.fn(async (_url: string | URL, _init?: RequestInit) =>
    new Response(body, {status})
  );
}

function requestJson(data: unknown, status = 200) {
  return requestRaw(JSON.stringify(data), status);
}

describe("parseOrderedTopLevelObject", () => {
  it("retains realistic integer-index keys in wire order", () => {
    const raw = orderedObject([
      ["3241660", game(3241660, "First")],
      ["632360", game(632360, "Second")],
      ["250900", game(250900, "Third")],
      ["1794680", game(1794680, "Fourth")],
    ]);

    expect(Object.keys(JSON.parse(raw))).toEqual([
      "250900",
      "632360",
      "1794680",
      "3241660",
    ]);
    expect(parseOrderedTopLevelObject(raw).keys).toEqual([
      "3241660",
      "632360",
      "250900",
      "1794680",
    ]);
  });

  it("handles nested arrays, objects, whitespace, and escaped strings", () => {
    const raw = ` \n {\n${orderedObject([
      ["3241660", {
        text: "escaped quote: \"; braces: } ] and comma: ,",
        nested: [{value: "a,b"}, [1, {closing: "}"}]],
      }]]).slice(1, -1)},\n"632360": {"name": "slash \\\\ and unicode \\u263a"}\n } \t`;

    const parsed = parseOrderedTopLevelObject(raw);
    expect(parsed.keys).toEqual(["3241660", "632360"]);
    expect(parsed.values["3241660"]).toMatchObject({
      text: "escaped quote: \"; braces: } ] and comma: ,",
    });
    expect(parsed.values["632360"]).toEqual({
      name: "slash \\ and unicode ☺",
    });
  });

  it("rejects duplicate decoded keys", () => {
    expect(() => parseOrderedTopLevelObject(
      "{\"10\": {\"name\": \"first\"}, \"\\u0031\\u0030\": {\"name\": \"second\"}}",
    )).toThrow(/duplicate/i);
  });

  it("bounds nested containers before loading values", () => {
    const raw = `{"10":${"[".repeat(128)}0${"]".repeat(128)}}`;
    expect(() => parseOrderedTopLevelObject(raw)).toThrow(/too deep/i);
  });
});

describe("createDiscoveryFetcher", () => {
  it("retains SteamSpy wire order as rank without custom reranking", async () => {
    const request = requestRaw(orderedObject([
      ["3241660", game(3241660, "First from API", {
        ccu: 1,
        positive: 1,
        negative: 99,
      })],
      ["632360", game(632360, "Second from API", {
        ccu: 50_000,
        positive: 999,
        negative: 1,
      })],
      ["250900", game(250900, "Third from API")],
      ["1794680", game(1794680, "Fourth from API")],
    ]));
    const discoverGames = createDiscoveryFetcher({now: () => NOW, request});

    const response = await discoverGames({kind: "tag", value: "Action"});

    expect(response.data?.candidates.map(({rank, appid, name}) => ({rank, appid, name})))
      .toEqual([
        {rank: 1, appid: 3241660, name: "First from API"},
        {rank: 2, appid: 632360, name: "Second from API"},
        {rank: 3, appid: 250900, name: "Third from API"},
        {rank: 4, appid: 1794680, name: "Fourth from API"},
      ]);
  });

  it("accepts strict numeric strings and trims names and owners", async () => {
    const request = requestJson({
      "1145360": {
        appid: "1145360",
        name: "  Hades  ",
        owners: "  5,000,000 .. 10,000,000  ",
        ccu: " 1234 ",
        positive: "95",
        negative: "5.0",
      },
    });
    const response = await createDiscoveryFetcher({now: () => NOW, request})({
      kind: "genre",
      value: "Action",
    });

    expect(response.data?.candidates).toEqual([{
      rank: 1,
      appid: 1145360,
      name: "Hades",
      owners: "5,000,000 .. 10,000,000",
      ccu: 1234,
      positive: 95,
      negative: 5,
      positivePercent: 95,
    }]);
  });

  it("does not coerce invalid metrics to zero and rejects unsafe integers and totals", async () => {
    const request = requestJson({
      "10": game(10, "Nulls", {
        owners: " ",
        ccu: null,
        positive: " ",
        negative: false,
      }),
      "20": game(20, "Hostile", {
        ccu: "1.5",
        positive: -1,
        negative: "Infinity",
      }),
      "30": game(30, "Unsafe", {
        ccu: "9007199254740992",
        positive: Number.MAX_SAFE_INTEGER,
        negative: 1,
      }),
      "40": game(40, "Unsafe positive", {
        positive: "9007199254740992",
        negative: 1,
      }),
    });
    const response = await createDiscoveryFetcher({now: () => NOW, request})({
      kind: "tag",
      value: "Action",
    });

    expect(response.data?.candidates).toMatchObject([
      {
        appid: 10,
        owners: null,
        ccu: null,
        positive: null,
        negative: null,
        positivePercent: null,
      },
      {appid: 20, ccu: null, positive: null, negative: null, positivePercent: null},
      {
        appid: 30,
        ccu: null,
        positive: Number.MAX_SAFE_INTEGER,
        negative: 1,
        positivePercent: null,
      },
      {appid: 40, positive: null, negative: 1, positivePercent: null},
    ]);
  });

  it("skips invalid keyed appids, raw appids, conflicts, and names with one aggregate warning", async () => {
    const request = requestRaw(orderedObject([
      ["not-an-appid", game(1, "Bad key")],
      ["20", game(20, "   ")],
      ["30", game(31, "Conflict")],
      ["40", game(40, "Invalid raw", {appid: false})],
      ["50", game(50, "Blank raw", {appid: ""})],
      ["60", {name: "Valid without raw appid", ccu: 1}],
    ]));
    const response = await createDiscoveryFetcher({now: () => NOW, request})({
      kind: "tag",
      value: "Action",
    });

    expect(response.data?.candidates).toEqual([{
      rank: 6,
      appid: 60,
      name: "Valid without raw appid",
      owners: null,
      ccu: 1,
      positive: null,
      negative: null,
      positivePercent: null,
    }]);
    expect(response.warnings).toEqual([
      "steamspy discovery skipped 5 invalid entries",
    ]);
  });

  it("computes positivePercent only from two valid counts with a safe positive total", async () => {
    const request = requestJson({
      "10": game(10, "Rated", {positive: "3", negative: 1}),
      "20": game(20, "No reviews", {positive: 0, negative: 0}),
      "30": game(30, "Invalid negative", {positive: 4, negative: "nope"}),
      "40": game(40, "All negative", {positive: 0, negative: 7}),
    });
    const response = await createDiscoveryFetcher({now: () => NOW, request})({
      kind: "tag",
      value: "Action",
    });

    expect(response.data?.candidates.map((candidate) => candidate.positivePercent))
      .toEqual([75, null, null, 0]);
  });

  it("rejects invalid inputs before reading the clock or requesting", async () => {
    const now = vi.fn(() => NOW);
    const request = requestJson({});
    const discoverGames = createDiscoveryFetcher({now, request});
    const invalidInputs = [
      {kind: "tag", value: "Action", limit: 0},
      {kind: "tag", value: "Action", limit: 51},
      {kind: "tag", value: "Action", limit: 1.5},
      {kind: "tag", value: "   "},
      {kind: "tag", value: "x".repeat(81)},
      {kind: "unknown", value: "Action"},
    ];

    for (const input of invalidInputs) {
      await expect(discoverGames(input as never)).rejects.toThrow(TypeError);
    }
    expect(now).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("trims input, defaults limit to 20, and sends exactly the encoded tag parameters", async () => {
    const request = requestJson({});
    const discoverGames = createDiscoveryFetcher({now: () => NOW, request});

    const response = await discoverGames({
      kind: "tag",
      value: "  Action & Roguelike/Co-op?  ",
    });

    expect(response.data?.query).toEqual({
      kind: "tag",
      value: "Action & Roguelike/Co-op?",
      limit: 20,
    });
    const [requestUrl, options] = request.mock.calls[0] ?? [];
    const url = new URL(String(requestUrl));
    expect(url.origin + url.pathname).toBe("https://steamspy.com/api.php");
    expect([...url.searchParams.entries()]).toEqual([
      ["request", "tag"],
      ["tag", "Action & Roguelike/Co-op?"],
    ]);
    expect(options?.headers).toEqual({"User-Agent": "steam-user-sim/0.1"});
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends exactly the encoded genre parameters and caps the final valid list", async () => {
    const request = requestRaw(orderedObject([
      ["10", game(10, "Invalid first", {appid: 11})],
      ["20", game(20, "First valid")],
      ["30", game(30, "Second valid")],
    ]));
    const discoverGames = createDiscoveryFetcher({now: () => NOW, request});

    const response = await discoverGames({kind: "genre", value: "Action RPG", limit: 1});

    const requestUrl = request.mock.calls[0]?.[0];
    expect([...new URL(String(requestUrl)).searchParams.entries()]).toEqual([
      ["request", "genre"],
      ["genre", "Action RPG"],
    ]);
    expect(response.data?.candidates).toMatchObject([
      {rank: 2, appid: 20, name: "First valid"},
    ]);
    expect(response.warnings).toContain("steamspy discovery skipped 1 invalid entries");
  });

  it("returns null for HTTP failures without leaking the URL query", async () => {
    const request = requestRaw("maintenance", 503);
    const secretLikeValue = "Action?token=do-not-leak&x=1";
    const response = await createDiscoveryFetcher({now: () => NOW, request})({
      kind: "tag",
      value: secretLikeValue,
    });

    expect(response.data).toBeNull();
    expect(response.warnings).toEqual(["steamspy discovery HTTP 503"]);
    expect(response.warnings.join(" ")).not.toContain(secretLikeValue);
    expect(response.warnings.join(" ")).not.toContain("request=tag");
    expect(response.meta?.request).toEqual({kind: "tag", value: secretLikeValue, limit: 20});
  });

  it("maps timeout and unreachable failures to source-scoped warnings", async () => {
    const timeout = new Error("request URL must not leak");
    timeout.name = "TimeoutError";
    const timeoutRequest = vi.fn(async () => Promise.reject(timeout));
    const unreachableRequest = vi.fn(async () => Promise.reject(new Error("socket failed")));

    const timeoutResult = await createDiscoveryFetcher({
      now: () => NOW,
      request: timeoutRequest,
    })({kind: "tag", value: "Action"});
    const unreachableResult = await createDiscoveryFetcher({
      now: () => NOW,
      request: unreachableRequest,
    })({kind: "tag", value: "Action"});

    expect(timeoutResult.warnings).toEqual(["steamspy discovery timeout"]);
    expect(unreachableResult.warnings).toEqual(["steamspy discovery unreachable"]);
  });

  it.each([
    ["malformed JSON", "{\"10\": {", "steamspy discovery invalid JSON"],
    [
      "duplicate keys",
      "{\"10\": {\"name\": \"first\"}, \"\\u0031\\u0030\": {\"name\": \"second\"}}",
      "steamspy discovery invalid JSON",
    ],
    [
      "nested duplicate keys",
      "{\"10\": {\"name\": \"first\", \"nested\": {\"x\": 1, \"\\u0078\": 2}}}",
      "steamspy discovery invalid JSON",
    ],
    ["non-object top level", "[]", "steamspy discovery returned an invalid response"],
  ])("rejects %s from the raw loader", async (_label, raw, warning) => {
    const response = await createDiscoveryFetcher({
      now: () => NOW,
      request: requestRaw(raw),
    })({kind: "tag", value: "Action"});

    expect(response.data).toBeNull();
    expect(response.warnings).toEqual([warning]);
  });

  it("rejects a declared response larger than the loader bound", async () => {
    const request = vi.fn(async () => new Response("{}", {
      headers: {"content-length": String(8 * 1024 * 1024 + 1)},
    }));
    const response = await createDiscoveryFetcher({now: () => NOW, request})({
      kind: "tag",
      value: "Action",
    });

    expect(response.data).toBeNull();
    expect(response.warnings).toEqual(["steamspy discovery invalid JSON"]);
  });

  it("returns an empty successful result with a no-candidates warning", async () => {
    const response = await createDiscoveryFetcher({
      now: () => NOW,
      request: requestJson({}),
    })({kind: "tag", value: "No Such Tag"});

    expect(response.data?.candidates).toEqual([]);
    expect(response.warnings).toEqual([
      "steamspy discovery returned no candidates",
    ]);
  });

  it("returns deterministic observation and SteamSpy estimate methodology metadata", async () => {
    const response = await createDiscoveryFetcher({
      now: () => NOW,
      request: requestJson({"10": game(10, "Game")}),
    })({kind: "genre", value: "  Action  ", limit: 7});

    expect(response.data?.observedAt).toBe(NOW.toISOString());
    expect(response.meta?.observedAt).toBe(NOW.toISOString());
    expect(response.meta?.sources).toEqual([{
      name: "SteamSpy",
      homepage: "https://steamspy.com/about",
      notes: expect.stringMatching(/estimate/i),
    }]);
    expect(response.meta?.request).toEqual({kind: "genre", value: "Action", limit: 7});

    const methodology = JSON.stringify(response.data?.methodology);
    expect(methodology).toMatch(/API order/i);
    expect(methodology).toMatch(/no custom reranking/i);
    expect(methodology).toMatch(/estimate/i);
    expect(methodology).toMatch(/ownership estimate range/i);
    expect(methodology).toMatch(/not unit sales/i);
    expect(methodology).toMatch(/recent.*small-sample/i);
    expect(methodology).toMatch(/unreliable/i);
    expect(JSON.stringify(response.meta?.methodology)).toBe(methodology);
  });
});
