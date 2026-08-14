import {mkdtemp, mkdir, readdir, rm, writeFile as nodeWriteFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {createPathResolver} from "./paths.js";
import {
  GeneratedPersonaSchema,
  PersonaSchema,
  type Persona,
} from "./persona-schemas.js";
import {createPersonaStore} from "./persona-store.js";
import {
  createPersonaDeriver,
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

function personaV2(overrides: Record<string, unknown> = {}) {
  return {
    ...persona(),
    schema_version: 2,
    target_context: {
      market: "Japan",
      language: "japanese",
      source_roles: [{appid: 1145360, role: "target"}],
    },
    decision_profile: {
      adoption_trigger: "日本語品質と操作感を確認できる",
      retention_trigger: "周回ごとの物語変化が続く",
      churn_trigger: "訳文または入力反応が期待を下回る",
      update_reaction: "既知の不満に対応するpatch noteを確認して再評価する",
    },
    evidence_basis: {
      observed_patterns: [
        {
          claim: "日本語品質を評価軸にする",
          evidence: [{source_appid: 1145360, recommendation_id: "rec-0"}],
        },
        {
          claim: "操作感を評価軸にする",
          evidence: [{source_appid: 1145360, recommendation_id: "rec-1"}],
        },
      ],
      inferred_traits: [{
        claim: "更新後に再評価する",
        basis: "更新反応を直接述べるレビューはなく、dealbreaker解消を条件にした推論",
        confidence: "low",
      }],
      limitations: ["polarity-balanced recent review sampleで市場構成比を表さない"],
      overall_confidence: "medium",
    },
    ...overrides,
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

  it("keeps legacy reads but requires a traceable decision profile for generated v2 personas", () => {
    expect(PersonaSchema.safeParse(persona()).success).toBe(true);
    expect(GeneratedPersonaSchema.safeParse(persona()).success).toBe(false);
    expect(GeneratedPersonaSchema.safeParse(personaV2()).success).toBe(true);

    const missingDecisionProfile = personaV2();
    delete missingDecisionProfile.decision_profile;
    expect(PersonaSchema.safeParse(missingDecisionProfile).success).toBe(false);
  });

  it("rejects v2 evidence and source roles that are not present in persona voice", () => {
    expect(GeneratedPersonaSchema.safeParse(personaV2({
      evidence_basis: {
        ...personaV2().evidence_basis,
        observed_patterns: [{
          claim: "unsupported",
          evidence: [{source_appid: 1145360, recommendation_id: "missing"}],
        }],
      },
    })).success).toBe(false);
    expect(GeneratedPersonaSchema.safeParse(personaV2({
      target_context: {
        market: "Japan",
        language: "japanese",
        source_roles: [{appid: 588650, role: "competitor"}],
      },
    })).success).toBe(false);
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
    expect(result.data?.reviews.slice(0, 4).map((item) => item.votedUp)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(new Set(result.data?.reviews.map((item) => item.recommendationId)).size).toBe(50);
    expect(result.data?.instruction).toContain("save_persona");
    expect(result.data?.generationReadiness).toEqual({
      status: "ready",
      generationAllowed: true,
      requestedCount: 5,
      supportedCount: 5,
      availableUniqueReviewCount: 50,
      requiredUniqueReviewCount: 15,
      minimumUniqueReviewsPerPersona: 3,
      voiceReuseAllowed: false,
    });
    expect(result.data?.instruction).toContain("persona間で再利用しない");
    expect(fetchReviews).toHaveBeenCalledTimes(4);
    expect(result.data?.schema).toMatchObject({type: "object"});
    expect(result.meta).toMatchObject({
      observedAt: NOW.toISOString(),
      methodology: {
        strategy: "requested-language-first-recent-polarity-balanced",
        ordering: "round-robin-appid-polarity",
        representative: false,
        requestedPerPolarity: 25,
        appids: [{
          appid: 1145360,
          population: {positive: 900, negative: 100, positivePercent: 90},
          sample: {
            positive: {requestedLanguageSelected: 1, fallbackSelected: 24, totalSelected: 25},
            negative: {requestedLanguageSelected: 1, fallbackSelected: 24, totalSelected: 25},
            positivePercent: 50,
          },
        }],
      },
    });
    expect(result.data?.instruction).toMatch(/balanced.*not representative.*population shares/i);
  });

  it("blocks persona generation when no persona has enough unique review voices", async () => {
    const fetchGame = vi.fn(async (appid: number) => ({data: {appid}, warnings: []}));
    const fetchReviews = vi.fn(async () => ({data: [], warnings: []}));

    const result = await createPersonaDeriver({
      fetchGame,
      fetchReviews,
      now: () => NOW,
    })([1145360], 2, 3, {language: "all"});

    expect(result.data?.generationReadiness).toEqual({
      status: "blocked",
      generationAllowed: false,
      requestedCount: 2,
      supportedCount: 0,
      availableUniqueReviewCount: 0,
      requiredUniqueReviewCount: 6,
      minimumUniqueReviewsPerPersona: 3,
      voiceReuseAllowed: false,
    });
    expect(result.data?.instruction).toContain("ペルソナを生成・保存しないでください");
    expect(result.data?.instruction).not.toContain("2 件生成してください");
    expect(result.warnings).toContain(
      "persona generation blocked: 0 of 2 requested personas have disjoint review voice support",
    );
  });

  it("limits persona generation to the count supported by disjoint review voices", async () => {
    const fetchGame = vi.fn(async (appid: number) => ({data: {appid}, warnings: []}));
    const fetchReviews = vi.fn(async (
      _appid: number,
      opts: ReviewOptions = {},
    ) => ({
      data: Array.from({length: opts.type === "positive" ? 3 : 2}, (_, index) =>
        review(`${opts.type}-${index}`, opts.type === "positive")),
      warnings: [],
    }));

    const result = await createPersonaDeriver({
      fetchGame,
      fetchReviews,
      now: () => NOW,
    })([1145360], 3, 3, {language: "all"});

    expect(result.data?.generationReadiness).toEqual({
      status: "partial",
      generationAllowed: true,
      requestedCount: 3,
      supportedCount: 1,
      availableUniqueReviewCount: 5,
      requiredUniqueReviewCount: 9,
      minimumUniqueReviewsPerPersona: 3,
      voiceReuseAllowed: false,
    });
    expect(result.data?.instruction).toContain("1 件だけ生成してください");
    expect(result.data?.instruction).toContain("persona間で再利用しない");
    expect(result.data?.instruction).not.toContain("3 件生成してください");
    expect(result.warnings).toContain(
      "persona generation limited: 1 of 3 requested personas have disjoint review voice support",
    );
  });

  it("bounds and round-robins evidence across appids and polarities", async () => {
    const fetchGame = vi.fn(async (appid: number) => ({
      data: {
        appid,
        name: `Game ${appid}`,
        reviewStats: {positive: 90, negative: 10, positivePercent: 90},
      },
      warnings: [],
    }));
    const fetchReviews = vi.fn(async (
      appid: number,
      opts: ReviewOptions = {},
    ) => ({
      data: Array.from({length: 3}, (_, index) =>
        review(`${appid}-${opts.type}-${index}`, opts.type === "positive")),
      warnings: [],
    }));

    const result = await createPersonaDeriver({
      fetchGame,
      fetchReviews,
      now: () => NOW,
    })([1145350, 1145360], 3, 3, {
      targetAppid: 1145350,
      market: "Japan",
      language: "japanese",
      focus: ["adoption", "retention", "update-response"],
    });

    expect(result.data?.reviews).toHaveLength(12);
    expect(result.data?.reviews.map(({sourceAppid, votedUp}) => [sourceAppid, votedUp]))
      .toEqual([
        [1145350, true],
        [1145350, false],
        [1145360, true],
        [1145360, false],
        [1145350, true],
        [1145350, false],
        [1145360, true],
        [1145360, false],
        [1145350, true],
        [1145350, false],
        [1145360, true],
        [1145360, false],
      ]);
    expect(result.data?.reviews.map(({sourceRole}) => sourceRole))
      .toEqual([
        "target", "target", "competitor", "competitor",
        "target", "target", "competitor", "competitor",
        "target", "target", "competitor", "competitor",
      ]);
    expect(result.data?.brief).toMatchObject({
      targetAppid: 1145350,
      market: "Japan",
      language: "japanese",
      focus: ["adoption", "retention", "update-response"],
      sources: [
        {appid: 1145350, role: "target"},
        {appid: 1145360, role: "competitor"},
      ],
    });
    expect(fetchReviews).toHaveBeenCalledTimes(4);
    expect(fetchReviews.mock.calls.every(([, opts]) => opts.limit === 3)).toBe(true);
    expect(result.meta).toMatchObject({
      request: {
        appids: [1145350, 1145360],
        count: 3,
        reviewsPerPolarity: 3,
        targetAppid: 1145350,
        market: "Japan",
        language: "japanese",
        focus: ["adoption", "retention", "update-response"],
      },
      methodology: {
        ordering: "round-robin-appid-polarity",
        requestedPerPolarity: 3,
      },
    });
  });

  it("preserves explicit target, competitor, and reference roles", async () => {
    const fetchGame = vi.fn(async (appid: number) => ({data: {appid}, warnings: []}));
    const fetchReviews = vi.fn(async (
      appid: number,
      opts: ReviewOptions = {},
    ) => ({
      data: Array.from({length: 3}, (_, index) =>
        review(`${appid}-${opts.type}-${index}`, opts.type === "positive")),
      warnings: [],
    }));

    const result = await createPersonaDeriver({
      fetchGame,
      fetchReviews,
      now: () => NOW,
    })([10, 20, 30], 3, 3, {
      sourceRoles: [
        {appid: 30, role: "reference"},
        {appid: 10, role: "target"},
        {appid: 20, role: "competitor"},
      ],
    });

    expect(result.data?.brief).toMatchObject({
      targetAppid: 10,
      sources: [
        {appid: 10, role: "target"},
        {appid: 20, role: "competitor"},
        {appid: 30, role: "reference"},
      ],
    });
    expect(result.data?.reviews.filter(({sourceAppid}) => sourceAppid === 30)
      .every(({sourceRole}) => sourceRole === "reference")).toBe(true);
    expect(result.meta?.request).toMatchObject({
      targetAppid: 10,
      sourceRoles: [
        {appid: 10, role: "target"},
        {appid: 20, role: "competitor"},
        {appid: 30, role: "reference"},
      ],
    });
  });

  it("rejects incomplete or conflicting explicit source roles before fetching", async () => {
    const fetchGame = vi.fn();
    const fetchReviews = vi.fn();
    const derive = createPersonaDeriver({fetchGame, fetchReviews});

    await expect(derive([10, 20], 3, 3, {
      sourceRoles: [{appid: 10, role: "target"}],
    })).rejects.toThrow(/cover exactly/i);
    await expect(derive([10, 20], 3, 3, {
      targetAppid: 10,
      sourceRoles: [
        {appid: 10, role: "competitor"},
        {appid: 20, role: "target"},
      ],
    })).rejects.toThrow(/targetAppid/i);
    expect(fetchGame).not.toHaveBeenCalled();
    expect(fetchReviews).not.toHaveBeenCalled();
  });

  it("keeps partial persona evidence when a dependency returns an invalid timestamp", async () => {
    const fetchGame = vi.fn(async (appid: number) => ({data: {appid}, warnings: []}));
    const fetchReviews = vi.fn(async (
      _appid: number,
      opts: ReviewOptions = {},
    ) => ({
      data: Array.from({length: 3}, (_, index) => ({
        ...review(`${opts.type}-${index}`, opts.type === "positive"),
        timestamp: index === 0 ? Number.MAX_SAFE_INTEGER : 1_700_000_000 + index,
      })),
      warnings: [],
    }));

    const result = await createPersonaDeriver({
      fetchGame,
      fetchReviews,
      now: () => NOW,
    })([10], 1, 3, {targetAppid: 10});
    const coverage = (result.meta?.methodology as {
      appids: Array<{sample: {coverage: Record<string, unknown>}}>;
    }).appids[0]?.sample.coverage;

    expect(result.data?.reviews).toHaveLength(6);
    expect(coverage).toMatchObject({
      invalidTimestampCount: 2,
      publishedRange: {
        earliest: "2023-11-14T22:13:21.000Z",
        latest: "2023-11-14T22:13:22.000Z",
      },
    });
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
      positive: {requestedLanguageSelected: 25, fallbackSelected: 0, totalSelected: 25},
      negative: {requestedLanguageSelected: 25, fallbackSelected: 0, totalSelected: 25},
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
          positive: {requestedLanguageSelected: 1, fallbackSelected: 0, totalSelected: 1},
          negative: {requestedLanguageSelected: 1, fallbackSelected: 0, totalSelected: 1},
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

  it("rejects review evidence limits outside 3 through 25", async () => {
    const derive = createPersonaDeriver({
      fetchGame: vi.fn(),
      fetchReviews: vi.fn(),
    });
    await expect(derive([1145360], 5, 2)).rejects.toThrow(/3 to 25/);
    await expect(derive([1145360], 5, 26)).rejects.toThrow(/3 to 25/);
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
