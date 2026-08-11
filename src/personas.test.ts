import {mkdtemp, mkdir, readdir, rm, writeFile as nodeWriteFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {createPathResolver} from "./paths.js";
import {
  PersonaSchema,
  createPersonaDeriver,
  createPersonaStore,
  type Persona,
} from "./personas.js";
import type {Review, ReviewOptions} from "./reviews.js";

const roots: string[] = [];
const NOW = new Date("2026-08-11T12:34:56.000Z");

async function tempResolver() {
  const root = await mkdtemp(join(tmpdir(), "steam-user-sim-personas-"));
  roots.push(root);
  await mkdir(join(root, "knowledge", "personas"), {recursive: true});
  return createPathResolver(root);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "jp-localization-hawk",
    source_appids: [1145360],
    archetype: "日本語品質に厳しいアクション愛好家",
    playtime_profile: "週10時間、クリア後も周回",
    priorities: ["自然な日本語", "入力応答"],
    voice: Array.from({length: 3}, (_, index) => ({
      text: `根拠レビュー ${index}`,
      source_appid: 1145360,
      recommendation_id: `rec-${index}`,
      language: "japanese",
      voted_up: index !== 2,
    })),
    dealbreakers: ["機械翻訳調の台詞"],
    price_sensitivity: "完成度が高ければ定価でも購入",
    ...overrides,
  };
}

function review(id: string, votedUp: boolean, language = "japanese"): Review {
  return {
    recommendationId: id,
    review: `text ${id}`,
    votedUp,
    playtimeHours: 10,
    language,
    timestamp: 1_700_000_000,
  };
}

describe("PersonaSchema", () => {
  it("requires three to five traceable voice examples", () => {
    expect(PersonaSchema.safeParse(persona({voice: persona().voice.slice(0, 2)})).success)
      .toBe(false);
    expect(PersonaSchema.safeParse(persona({
      voice: [...persona().voice, ...persona().voice, persona().voice[0]!],
    })).success).toBe(false);

    const missingSource = structuredClone(persona()) as Record<string, unknown>;
    delete (missingSource.voice as Array<Record<string, unknown>>)[0]?.recommendation_id;
    expect(PersonaSchema.safeParse(missingSource).success).toBe(false);
  });
});

describe("persona store", () => {
  it("round-trips a validated persona and lists it", async () => {
    const store = createPersonaStore(await tempResolver());
    await store.savePersona(persona());

    await expect(store.loadPersona("jp-localization-hawk")).resolves.toEqual(persona());
    await expect(store.listPersonas()).resolves.toEqual([persona()]);
  });

  it("rejects traversal and atomic overwrite by default", async () => {
    const store = createPersonaStore(await tempResolver());
    await store.savePersona(persona());

    await expect(store.loadPersona("../escape")).rejects.toThrow();
    await expect(store.savePersona(persona({archetype: "changed"}))).rejects.toThrow(
      /already exists/i,
    );
    expect((await store.loadPersona(persona().id)).archetype).not.toBe("changed");
  });

  it("atomically replaces when overwrite is explicit", async () => {
    const store = createPersonaStore(await tempResolver());
    await store.savePersona(persona());
    await store.savePersona(persona({archetype: "changed"}), {overwrite: true});

    expect((await store.loadPersona(persona().id)).archetype).toBe("changed");
  });

  it("cleans up only its temporary file when rename fails", async () => {
    const resolver = await tempResolver();
    const unrelated = join(resolver.root, "knowledge", "personas", ".keep.tmp");
    await nodeWriteFile(unrelated, "keep");
    const store = createPersonaStore(resolver, {
      rename: vi.fn(async () => {
        throw new Error("rename failed");
      }),
    });

    await expect(store.savePersona(persona(), {overwrite: true})).rejects.toThrow(
      "rename failed",
    );
    const files = await readdir(join(resolver.root, "knowledge", "personas"));
    expect(files).toEqual([".keep.tmp"]);
  });
});

describe("persona derivation pack", () => {
  it("fills Japanese shortages from all languages without duplicates", async () => {
    const fetchGame = vi.fn(async (appid: number) => ({
      data: {
        appid,
        name: "Hades",
        reviewStats: {positive: 900, negative: 100, positivePercent: 90},
      },
      warnings: [],
    }));
    const fetchReviews = vi.fn(async (
      _appid: number,
      opts: ReviewOptions = {},
    ) => {
      const positive = opts.type === "positive";
      if (opts.language === "japanese") {
        return {data: [review(`jp-${positive ? "pos" : "neg"}`, positive)], warnings: []};
      }
      return {
        data: [
          review(`jp-${positive ? "pos" : "neg"}`, positive),
          ...Array.from({length: 24}, (_, index) =>
            review(`all-${positive ? "pos" : "neg"}-${index}`, positive, "english")),
        ],
        warnings: [],
      };
    });
    const derive = createPersonaDeriver({fetchGame, fetchReviews, now: () => NOW});

    const result = await derive([1145360]);
    expect(result.data?.requestedCount).toBe(5);
    expect(result.data?.reviews).toHaveLength(50);
    expect(new Set(result.data?.reviews.map((item) => item.recommendationId)).size).toBe(50);
    expect(result.data?.instruction).toContain("save_persona");
    expect(fetchReviews).toHaveBeenCalledTimes(4);
    expect(result.data?.schema).toMatchObject({type: "object"});
    expect(result.meta).toMatchObject({
      observedAt: NOW.toISOString(),
      methodology: {
        strategy: "recent-polarity-balanced",
        representative: false,
        requestedPerPolarity: 25,
        appids: [{
          appid: 1145360,
          population: {positive: 900, negative: 100, positivePercent: 90},
          sample: {
            positive: {japaneseSelected: 1, fallbackSelected: 24, totalSelected: 25},
            negative: {japaneseSelected: 1, fallbackSelected: 24, totalSelected: 25},
            positivePercent: 50,
          },
        }],
      },
    });
    expect(result.data?.instruction).toMatch(/balanced.*not representative.*population shares/i);
  });

  it("does not request fallback when Japanese evidence alone fills each polarity", async () => {
    const fetchGame = vi.fn(async (appid: number) => ({data: {
      appid,
      reviewStats: {positive: 3, negative: 1, positivePercent: 75},
    }, warnings: []}));
    const fetchReviews = vi.fn(async (
      _appid: number,
      opts: ReviewOptions = {},
    ) => ({
      data: Array.from({length: 25}, (_, index) =>
        review(`jp-${opts.type}-${index}`, opts.type === "positive")),
      warnings: [],
    }));

    const result = await createPersonaDeriver({
      fetchGame,
      fetchReviews,
      now: () => NOW,
    })([1145360]);

    expect(fetchReviews).toHaveBeenCalledTimes(2);
    const sampling = (result.meta?.methodology as {
      appids: Array<{sample: Record<string, unknown>}>;
    }).appids[0]?.sample;
    expect(sampling).toMatchObject({
      positive: {japaneseSelected: 25, fallbackSelected: 0, totalSelected: 25},
      negative: {japaneseSelected: 25, fallbackSelected: 0, totalSelected: 25},
    });
  });

  it("keeps sampling metadata and reviews when the game profile is unavailable", async () => {
    const fetchGame = vi.fn(async () => ({data: null, warnings: ["steam store timeout"]}));
    const fetchReviews = vi.fn(async (
      _appid: number,
      opts: ReviewOptions = {},
    ) => ({
      data: [review(`${opts.type}`, opts.type === "positive")],
      warnings: [],
    }));

    const result = await createPersonaDeriver({
      fetchGame,
      fetchReviews,
      now: () => NOW,
    })([1145360]);

    expect(result.data?.games).toEqual([]);
    expect(result.data?.reviews).toHaveLength(2);
    expect(result.warnings).toContain("appid 1145360 game profile unavailable");
    expect(result.meta?.methodology).toMatchObject({
      appids: [{
        appid: 1145360,
        population: {positive: null, negative: null, positivePercent: null},
        sample: {
          positive: {japaneseSelected: 1, fallbackSelected: 0, totalSelected: 1},
          negative: {japaneseSelected: 1, fallbackSelected: 0, totalSelected: 1},
        },
      }],
    });
  });

  it("rejects requested persona counts outside 1 through 12", async () => {
    const derive = createPersonaDeriver({
      fetchGame: vi.fn(),
      fetchReviews: vi.fn(),
    });
    await expect(derive([1145360], 0)).rejects.toThrow(/1 to 12/);
    await expect(derive([1145360], 13)).rejects.toThrow(/1 to 12/);
  });

  it("rejects more than twelve source appids before fetching", async () => {
    const fetchGame = vi.fn();
    const fetchReviews = vi.fn();
    const derive = createPersonaDeriver({fetchGame, fetchReviews});

    await expect(derive(Array.from({length: 13}, () => 1145360)))
      .rejects.toThrow(/at most 12/);
    expect(fetchGame).not.toHaveBeenCalled();
    expect(fetchReviews).not.toHaveBeenCalled();
  });
});
