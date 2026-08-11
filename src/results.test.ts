import {describe, expect, it} from "vitest";
import {createResultStore} from "./results.js";

const NOW = "2026-08-11T09:10:11.000Z";
const HANDLES = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

function ids() {
  let index = 0;
  return () => HANDLES[index++]!;
}

describe("result store", () => {
  it("tracks and returns an immutable exact tool envelope", () => {
    const store = createResultStore({idFactory: ids()});
    const tracked = store.remember("derive_personas", {
      data: {games: [{appid: 1145350}], reviews: [{id: "full-review"}]},
      warnings: ["source warning"],
      meta: {observedAt: NOW, methodology: {representative: false}},
    });

    expect(tracked.meta?.resultHandle).toBe(HANDLES[0]);
    const cached = store.get(HANDLES[0]);
    expect(cached).toEqual({
      sourceTool: "derive_personas",
      observedAt: NOW,
      payload: tracked,
    });

    (tracked.data as {games: unknown[]}).games.length = 0;
    expect(store.get(HANDLES[0]).payload).toMatchObject({
      data: {games: [{appid: 1145350}], reviews: [{id: "full-review"}]},
    });
  });

  it("does not issue a handle without a valid observedAt", () => {
    const store = createResultStore({idFactory: ids()});
    expect(store.remember("steam_search", {data: [], warnings: []}).meta).toBeUndefined();
    expect(store.remember("steam_search", {
      data: [],
      warnings: [],
      meta: {observedAt: "not-a-date"},
    }).meta).toEqual({observedAt: "not-a-date"});
  });

  it("does not cache results that cannot fit in an intel artifact", () => {
    const store = createResultStore({idFactory: ids()});
    const result = store.remember("steam_reviews", {
      data: {text: "x".repeat(1024 * 1024)},
      warnings: [],
      meta: {observedAt: NOW},
    });

    expect(result.meta).toEqual({observedAt: NOW});
    expect(result.warnings).toContain(
      "exact result persistence unavailable: tool result exceeds 1 MiB; reduce the requested evidence size",
    );
    expect(() => store.get(HANDLES[0])).toThrow(/unknown or expired/);
  });

  it("evicts the oldest handle at its bounded capacity", () => {
    const store = createResultStore({capacity: 2, idFactory: ids()});
    for (const query of ["one", "two", "three"]) {
      store.remember("steam_search", {
        data: {query},
        warnings: [],
        meta: {observedAt: NOW},
      });
    }

    expect(() => store.get(HANDLES[0])).toThrow(/unknown or expired/);
    expect(store.get(HANDLES[1]).payload).toMatchObject({data: {query: "two"}});
    expect(store.get(HANDLES[2]).payload).toMatchObject({data: {query: "three"}});
  });
});
