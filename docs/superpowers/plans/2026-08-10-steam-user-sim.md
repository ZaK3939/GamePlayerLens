# steam-user-sim v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ゲーム開発コンサル用MCPサーバー v1 — Steamデータ取得・ペルソナ派生・UIキャプチャの7 tool + canonical ナレッジ + 実行レシピ(MCP prompts)。

**Architecture:** stateレスなstdio MCPサーバー。状態は全部ファイル(`knowledge/`, `workspaces/`)。ペルソナの思考はクライアント側Claudeが担当し、サーバーはデータと型を提供する(spec 案A)。

**Tech Stack:** TypeScript (Node 20+, ESM), `@modelcontextprotocol/sdk`, `zod`, `vitest`。外部API: Steam Store API / SteamSpy / IsThereAnyDeal (キー任意) / Obscura (バイナリ任意)。

## Global Constraints

- パッケージマネージャは pnpm。ESM (`"type": "module"`)。
- 外部APIキーは `ITAD_API_KEY` と `OBSCURA_PATH` の2つのみ、どちらも**任意**。未設定でもサーバーは起動し、該当toolが warnings/エラーメッセージで代替手順を案内する。
- 全toolの返り値は `{ data, warnings: string[] }` 形(部分成功を隠さない)。
- 外部HTTPは全て 8000ms timeout(Steam Sonar の `STEAM_V2_TIMEOUT_MS` に合わせる)。
- スモークテストの固定appid: **Hades = 1145360**。
- テストは vitest のみ。ネットワークテストは実APIを叩く(モック不使用、spec方針)。
- knowledge/ 配下のドキュメントは日本語。コードのコメント・識別子は英語。

---

### Task 1: プロジェクト scaffold + fetch helper

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/http.ts`
- Test: `src/http.test.ts`

**Interfaces:**
- Produces: `fetchJson<T>(url: string, opts?: {timeoutMs?: number}): Promise<{data: T | null, warnings: string[]}>` — 全後続タスクのHTTP基盤。失敗時 `data: null` + warning文字列(例: `"steamspy timeout"`)。throwしない。

- [ ] **Step 1: scaffold**

```bash
pnpm init
pnpm add @modelcontextprotocol/sdk zod
pnpm add -D typescript vitest @types/node tsx
```

`package.json` に追記:

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: failing test**

`src/http.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchJson } from "./http.js";

describe("fetchJson", () => {
  it("returns parsed JSON on success", async () => {
    const r = await fetchJson<{ appid: number }>(
      "https://steamspy.com/api.php?request=appdetails&appid=1145360",
    );
    expect(r.data?.appid).toBe(1145360);
    expect(r.warnings).toEqual([]);
  });

  it("returns null + warning on unreachable host", async () => {
    const r = await fetchJson("https://invalid.invalid/x", { timeoutMs: 2000 });
    expect(r.data).toBeNull();
    expect(r.warnings.length).toBe(1);
  });
});
```

- [ ] **Step 3: run test, verify FAIL** — `pnpm test` → "Cannot find module './http.js'"

- [ ] **Step 4: implement**

`src/http.ts`:

```ts
export interface FetchResult<T> {
  data: T | null;
  warnings: string[];
}

export async function fetchJson<T>(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<FetchResult<T>> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "steam-user-sim/0.1" },
    });
    if (!res.ok) return { data: null, warnings: [`${new URL(url).host} HTTP ${res.status}`] };
    return { data: (await res.json()) as T, warnings: [] };
  } catch (e) {
    const kind = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "unreachable";
    return { data: null, warnings: [`${new URL(url).host} ${kind}`] };
  }
}
```

- [ ] **Step 5: run test, verify PASS** — `pnpm test`

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: scaffold + fetchJson helper"`

---

### Task 2: steam.ts — `steam_search` / `steam_fetch` のデータ層

**Files:**
- Create: `src/steam.ts`
- Test: `src/steam.test.ts`

**Interfaces:**
- Consumes: `fetchJson` (Task 1)
- Produces:
  - `searchGames(query: string): Promise<FetchResult<SearchHit[]>>` — `SearchHit = { appid: number; name: string }`
  - `fetchGame(appid: number): Promise<FetchResult<GameProfile>>` — `GameProfile = { appid; name; shortDescription; releaseDate; tags: string[]; genres: string[]; languages: string[]; prices: Record<"us"|"jp"|"eu", {currency: string; finalFormatted: string; discountPercent: number} | null>; reviewStats: {positive: number; negative: number; positivePercent: number} | null; ccu: number | null; owners: string | null; screenshots: string[] }`

Steam Sonar `src/lib/steam.ts` の `appdetails` パターンと `src/lib/extension/v2/steam-client.ts` の言語マップ/timeout方針を踏襲。SteamSpy (`https://steamspy.com/api.php?request=appdetails&appid=N`) から tags/owners/ccu/positive/negative、Store API (`https://store.steampowered.com/api/appdetails?appids=N&cc=us|jp|de&l=english`) から価格・言語・スクショ。地域別価格は cc を変えて3回叩く(eu は cc=de で代表)。`supported_languages` はHTMLタグ入り文字列なので `/<[^>]+>/g` と `*` を除去して `, ` split。

- [ ] **Step 1: failing test**

`src/steam.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { searchGames, fetchGame } from "./steam.js";

describe("steam data layer (live API, appid=Hades)", () => {
  it("searchGames finds Hades", async () => {
    const r = await searchGames("Hades");
    expect(r.data?.some((h) => h.appid === 1145360)).toBe(true);
  });

  it("fetchGame returns normalized profile", async () => {
    const r = await fetchGame(1145360);
    expect(r.data?.name).toBe("Hades");
    expect(r.data?.languages).toContain("Japanese");
    expect(r.data?.prices.jp?.currency).toBe("JPY");
    expect(r.data?.reviewStats!.positivePercent).toBeGreaterThan(90);
    expect(r.data?.tags.length).toBeGreaterThan(3);
  }, 30_000);
});
```

- [ ] **Step 2: run, verify FAIL**

- [ ] **Step 3: implement**

`src/steam.ts` の骨子(検索は storesearch エンドポイント):

```ts
import { fetchJson, type FetchResult } from "./http.js";

const STORE = "https://store.steampowered.com/api";
const SPY = "https://steamspy.com/api.php";

export interface SearchHit { appid: number; name: string }

export async function searchGames(query: string): Promise<FetchResult<SearchHit[]>> {
  const r = await fetchJson<{ items: { id: number; name: string }[] }>(
    `${STORE}/storesearch/?term=${encodeURIComponent(query)}&cc=us&l=english`,
  );
  return { data: r.data?.items.map((i) => ({ appid: i.id, name: i.name })) ?? null, warnings: r.warnings };
}

const REGION_CC = { us: "us", jp: "jp", eu: "de" } as const;

export interface GameProfile { /* Interfaces欄の通り */ }

export async function fetchGame(appid: number): Promise<FetchResult<GameProfile>> {
  const warnings: string[] = [];
  // 3地域の appdetails + steamspy を Promise.all で並列取得
  // 各地域: `${STORE}/appdetails?appids=${appid}&cc=${cc}&l=english`
  //   → json[appid].data.price_overview から {currency, final_formatted, discount_percent}
  //   price_overview欠落(無料/未発売/地域制限)は null + warning
  // us応答から name / short_description / release_date.date / genres / screenshots(path_full) /
  //   supported_languages(タグ除去+split) を採用
  // steamspy応答から tags(Object.keys), owners, ccu, positive, negative
  //   positivePercent = Math.round(positive / (positive + negative) * 100)
  // steamspy欠落時は該当フィールド null + warning "steamspy unavailable"
  // us appdetails 欠落時のみ data: null
}
```

(コメント部は実装時にそのままコードへ展開する。分岐は「us失敗→全体null」「spy失敗→部分成功」の2つだけ。)

- [ ] **Step 4: run, verify PASS**(SteamSpy が落ちていたら tags/ccu の expect を warnings 確認に緩めず、リトライで通す — flaky時は一時 `it.skip` ではなく再実行)

- [ ] **Step 5: Commit** — `feat: steam data layer (search + fetch)`

---

### Task 3: `steam_reviews` データ層

**Files:**
- Create: `src/reviews.ts`
- Test: `src/reviews.test.ts`

**Interfaces:**
- Consumes: `fetchJson` (Task 1)
- Produces: `fetchReviews(appid: number, opts?: {language?: string; type?: "all"|"positive"|"negative"; minPlaytimeHours?: number; limit?: number}): Promise<FetchResult<Review[]>>` — `Review = { review: string; votedUp: boolean; playtimeHours: number; language: string; timestamp: number }`

エンドポイント: `https://store.steampowered.com/appreviews/{appid}?json=1&filter=recent&language={lang}&review_type={type}&num_per_page=100&cursor={cursor}`。`language` はSteam言語名(`japanese` 等)、デフォルト `all`。`limit`(デフォルト100、最大300)までcursorページング(`cursor` はURLエンコード必須)。文字化け対策はSteam Sonar `steam-review-text.ts` の簡易版: 制御文字 `/[ --]/g` 除去と `?{3,}` 連続の除去のみ移植(full版のmojibake検出はv1不要)。

- [ ] **Step 1: failing test**

```ts
import { describe, it, expect } from "vitest";
import { fetchReviews } from "./reviews.js";

describe("fetchReviews (live, Hades)", () => {
  it("fetches japanese negative reviews with playtime", async () => {
    const r = await fetchReviews(1145360, { language: "japanese", type: "negative", limit: 20 });
    expect(r.data!.length).toBeGreaterThan(0);
    expect(r.data![0].votedUp).toBe(false);
    expect(typeof r.data![0].playtimeHours).toBe("number");
  }, 30_000);
});
```

- [ ] **Step 2: run, verify FAIL**
- [ ] **Step 3: implement**(`author.playtime_forever` は分単位 → `Math.round(x/60*10)/10` で時間に。`minPlaytimeHours` はクライアント側filter)
- [ ] **Step 4: run, verify PASS**
- [ ] **Step 5: Commit** — `feat: review fetcher with language/type/playtime filters`

---

### Task 4: `steam_timeline` データ層

**Files:**
- Create: `src/timeline.ts`
- Test: `src/timeline.test.ts`

**Interfaces:**
- Consumes: `fetchJson` (Task 1)
- Produces: `fetchTimeline(appid: number): Promise<FetchResult<Timeline>>` — `Timeline = { ccu: number | null; owners: string | null; avgPlaytimeForever: number | null; priceHistory: {date: string; priceUsd: number; discountPercent: number}[] | null }`

CCU/owners/playtime は SteamSpy。価格履歴は ITAD API v2 (`ITAD_API_KEY` 環境変数):
1. `https://api.isthereanydeal.com/games/lookup/v1?key=K&appid=N` → `game.id` (uuid)
2. `https://api.isthereanydeal.com/games/history/v2?key=K&id=UUID&shops=61` (61=Steam) → `[{timestamp, deal: {price: {amount}, cut}}]`

キー未設定時: `priceHistory: null` + warning `"ITAD_API_KEY not set — price history unavailable. Get a free key at https://isthereanydeal.com/apps/my/"`。

- [ ] **Step 1: failing test**

```ts
import { describe, it, expect } from "vitest";
import { fetchTimeline } from "./timeline.js";

describe("fetchTimeline (live, Hades)", () => {
  it("returns ccu from steamspy; price history per ITAD key presence", async () => {
    const r = await fetchTimeline(1145360);
    expect(r.data!.ccu).not.toBeNull();
    if (process.env.ITAD_API_KEY) {
      expect(r.data!.priceHistory!.length).toBeGreaterThan(0);
      expect(r.data!.priceHistory![0]).toHaveProperty("discountPercent");
    } else {
      expect(r.data!.priceHistory).toBeNull();
      expect(r.warnings.join()).toContain("ITAD_API_KEY");
    }
  }, 30_000);
});
```

- [ ] **Step 2: run, verify FAIL**
- [ ] **Step 3: implement**
- [ ] **Step 4: run, verify PASS**
- [ ] **Step 5: Commit** — `feat: ccu + price timeline (steamspy + itad)`

---

### Task 5: personas — スキーマ・保存・派生素材パック

**Files:**
- Create: `src/personas.ts`, `knowledge/personas/.gitkeep`
- Test: `src/personas.test.ts`

**Interfaces:**
- Consumes: `fetchReviews` (Task 3), `fetchGame` (Task 2)
- Produces:
  - `PersonaSchema` (zod) — specのペルソナJSONスキーマそのまま: `{ id, source_appids: number[], archetype, playtime_profile, priorities: string[], voice: string[], dealbreakers: string[], price_sensitivity }` 全て必須
  - `buildDerivationPack(appids: number[]): Promise<FetchResult<DerivationPack>>` — `DerivationPack = { games: {appid; name; tags: string[]}[]; reviews: {appid: number; review: string; votedUp: boolean; playtimeHours: number; language: string}[]; instruction: string }`。ゲームごとに 好評25件+不評25件(japanese優先、足りなければall言語で補完し warning)。`instruction` はクライアントClaudeへの派生指示文(固定文字列: レビュー群からN体のペルソナを抽出し、voice には実レビュー引用を3-5件入れ、PersonaSchema準拠JSONで `save_persona` すること)
  - `savePersona(persona: unknown): {id: string} ` — zod検証→ `knowledge/personas/{id}.json` へ書き込み。検証失敗はzodエラー文字列をthrow
  - `listPersonas(): {id: string; archetype: string}[]` / `loadPersona(id: string): Persona`

- [ ] **Step 1: failing test**

```ts
import { describe, it, expect } from "vitest";
import { PersonaSchema, savePersona, loadPersona, buildDerivationPack } from "./personas.js";
import { rmSync } from "node:fs";

const valid = {
  id: "test-hawk", source_appids: [1145360], archetype: "テスト用",
  playtime_profile: "100h/年", priorities: ["UI"], voice: ["引用1"],
  dealbreakers: ["機械翻訳"], price_sensitivity: "セール待ち型",
};

describe("personas", () => {
  it("save + load round-trip", () => {
    savePersona(valid);
    expect(loadPersona("test-hawk").archetype).toBe("テスト用");
    rmSync("knowledge/personas/test-hawk.json");
  });
  it("rejects missing fields", () => {
    expect(() => savePersona({ id: "x" })).toThrow();
  });
  it("buildDerivationPack collects reviews (live)", async () => {
    const r = await buildDerivationPack([1145360]);
    expect(r.data!.reviews.length).toBeGreaterThan(10);
    expect(r.data!.instruction).toContain("save_persona");
  }, 60_000);
});
```

- [ ] **Step 2: run, verify FAIL**
- [ ] **Step 3: implement**(ファイルパスはprocess.cwd()基準の `knowledge/personas/`。ディレクトリは `mkdirSync(recursive)`)
- [ ] **Step 4: run, verify PASS**
- [ ] **Step 5: Commit** — `feat: persona schema, storage, derivation pack`

---

### Task 6: `ui_capture` — Obscuraスクショ

**Files:**
- Create: `src/capture.ts`
- Test: `src/capture.test.ts`
- Modify: `package.json`(`pnpm add puppeteer-core`)

**Interfaces:**
- Consumes: なし
- Produces: `captureUrl(url: string, outPath: string): Promise<FetchResult<{path: string}>>` — `OBSCURA_PATH` のバイナリを `--remote-debugging-port=0` で起動し `puppeteer-core` の `connect`(ObscuraはCDP互換・Puppeteer drop-in)でフルページPNGを `outPath` に保存。`OBSCURA_PATH` 未設定時は `data: null` + warning: `"OBSCURA_PATH not set. Install: https://github.com/h4ckf0r0day/obscura/releases — or place screenshots manually in knowledge/ui-references/"`。キャプチャ失敗(403等)も同じ手動配置フォールバック文言をwarningに含める。

- [ ] **Step 1: failing test**

```ts
import { describe, it, expect } from "vitest";
import { captureUrl } from "./capture.js";
import { existsSync, rmSync } from "node:fs";

describe("captureUrl", () => {
  it("without OBSCURA_PATH returns instructive warning", async () => {
    delete process.env.OBSCURA_PATH;
    const r = await captureUrl("https://example.com", "/tmp/x.png");
    expect(r.data).toBeNull();
    expect(r.warnings.join()).toContain("ui-references");
  });
  it.skipIf(!process.env.OBSCURA_PATH)("captures example.com", async () => {
    const out = "knowledge/intel/_test-capture.png";
    const r = await captureUrl("https://example.com", out);
    expect(existsSync(r.data!.path)).toBe(true);
    rmSync(out);
  }, 30_000);
});
```

- [ ] **Step 2: run, verify FAIL**
- [ ] **Step 3: implement**(子プロセスspawn→stdoutからws URL取得→`puppeteer.connect({browserWSEndpoint})`→`page.goto(url, {waitUntil: "networkidle2", timeout: 15000})`→`page.screenshot({path: outPath, fullPage: true})`→プロセスkill。try/finallyでkill保証)
- [ ] **Step 4: run, verify PASS**(OBSCURA_PATH無し環境では1本目のみ実行される — それで可)
- [ ] **Step 5: Commit** — `feat: obscura-based ui capture with manual fallback`

---

### Task 7: canonical ナレッジ + 実行レシピ

**Files:**
- Create: `knowledge/templates/adoption-eval.md`, `knowledge/rubrics/harsh-critic.md`, `skills/run-sim.md`, `skills/ui-blind-compare.md`, `knowledge/ui-references/.gitkeep`, `knowledge/intel/.gitkeep`, `workspaces/.gitkeep`

**Interfaces:**
- Produces: Task 8 の `get_knowledge` / prompts 登録が読むファイル群。コード無し・テスト無し(内容はレビューで担保)。

- [ ] **Step 1: `knowledge/templates/adoption-eval.md`** — hyperamm trader-adoption-evaluation のゲーム翻案。必須セクション:
  1. `Overall Assessment`(Adoption Likelihood / Initial Friction / Retention Potential / Key Blocking Factors)
  2. `Who Plays and Why — Flow Analysis`(Flow N: 誰が→なぜ買う/遊ぶ→どこで離脱、各Flowに **Volume driver / Friction / Retention / Current size / What we control** の5項目)
  3. `Flow Summary` 表
  4. 領域別所見(UI / 価格 / ローカライズ / 競合)— **各主張に根拠欄必須**(`knowledge/intel/` への相対リンク or steam_* toolの取得値。根拠が無い主張は「根拠不足」と明記)
  5. 変更相談の場合は全セクションを「現状 vs 変更案」の差分形式で書く
- [ ] **Step 2: `knowledge/rubrics/harsh-critic.md`** — 辛口批評家の合格基準: (a) 根拠の無い主張が1つでもあれば差し戻し (b) UIは本物スクショと並べたブラインド比較でAAAに見えなければ続行 (c) ペルソナの発言が voice の実レビュー引用と口調矛盾したら差し戻し (d) 全領域subagentの出力が基準を満たすまで /loop
- [ ] **Step 3: `skills/run-sim.md`** — specのデータフロー①〜⑥をクライアントClaude向け手順書に展開(①対象理解→②competitor特定: steam_search/steam_fetch/steam_timeline→③derive_personas→④領域別subagent並列(AAA品質プロンプトの型: 項目ごとにsubagent展開)→⑤harsh-critic.mdで批評ループ→⑥workspaces/<target>/<date>-<topic>.md にadoption-eval.md形式で出力)
- [ ] **Step 4: `skills/ui-blind-compare.md`** — gameuidatabase等の本物UIスクショ(ui_capture or knowledge/ui-references/手動配置)と対象UIを並べ、どちらが本物か明かさずに批評家subagentへ提示→AAAに見えない点を列挙させる手順
- [ ] **Step 5: Commit** — `docs: canonical knowledge (templates, rubrics, run recipes)`

---

### Task 8: MCPサーバー組み立て — tool/prompt登録

**Files:**
- Create: `src/index.ts`, `src/knowledge.ts`
- Test: `src/index.test.ts`
- Modify: `package.json`(`"bin": {"steam-user-sim": "dist/index.js"}`)

**Interfaces:**
- Consumes: Task 1-7 の全export
- Produces: stdio MCPサーバー。tool 7個: `steam_search` / `steam_fetch` / `steam_reviews` / `steam_timeline` / `derive_personas` / `ui_capture` / `get_knowledge`。prompt 2個: `run-sim` / `ui-blind-compare`(`skills/*.md` の中身をそのまま返す)。

- [ ] **Step 1: `src/knowledge.ts`** — `getKnowledge(kind: "personas"|"templates"|"rubrics"|"intel", id?: string)`: id無しは一覧(ファイル名+personasはarchetype付き)、id有りは中身を返す。パスは `knowledge/{kind}/` 固定、`id` は `/[a-z0-9-_.]+/i` 検証(traversal防止 — 信頼境界の入力検証なので省略しない)。
- [ ] **Step 2: failing test**

`src/index.test.ts`(in-memory transportでMCPハンドシェイク):

```ts
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "./index.js";

describe("mcp server", () => {
  it("lists 7 tools and 2 prompts", async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await buildServer().connect(st);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(ct);
    expect((await client.listTools()).tools).toHaveLength(7);
    expect((await client.listPrompts()).prompts).toHaveLength(2);
  });
  it("get_knowledge returns rubric content", async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await buildServer().connect(st);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(ct);
    const r = await client.callTool({ name: "get_knowledge", arguments: { kind: "rubrics", id: "harsh-critic.md" } });
    expect(JSON.stringify(r.content)).toContain("ブラインド");
  });
});
```

- [ ] **Step 3: run, verify FAIL**
- [ ] **Step 4: implement** — `buildServer()` が `McpServer` を組み立ててreturn(テスト用)、`src/index.ts` 末尾で直接実行時のみ `StdioServerTransport` に接続。各toolは対応するデータ層関数を呼び、`{data, warnings}` をJSONでcontentに返す。zodでtool入力スキーマ定義(appidはpositive int、queryはstring等)。
- [ ] **Step 5: run, verify PASS**(全テストスイート `pnpm test`)
- [ ] **Step 6: Commit** — `feat: mcp server wiring (7 tools, 2 prompts)`

---

### Task 9: README + Claude Code接続確認

**Files:**
- Create: `README.md`, `.mcp.json`

**Interfaces:**
- Consumes: 全タスク

- [ ] **Step 1: `.mcp.json`**

```json
{
  "mcpServers": {
    "steam-user-sim": {
      "command": "pnpm",
      "args": ["tsx", "src/index.ts"],
      "env": { "ITAD_API_KEY": "", "OBSCURA_PATH": "" }
    }
  }
}
```

- [ ] **Step 2: `README.md`** — 目的(ゲーム開発の「変更の右腕」)、セットアップ(pnpm install / 任意キー2つ)、tool一覧、使い方(`/run-sim` prompt起点のフロー)、specへのリンク。
- [ ] **Step 3: エンドツーエンド確認** — `pnpm build` が通ること、`pnpm test` 全パス、`echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | pnpm tsx src/index.ts` がinitialize応答を返すこと。
- [ ] **Step 4: Commit** — `docs: readme + mcp config`

---

## Self-Review 済みメモ

- spec対応: tool 7個(Task 2,3,4,5,6,8)、knowledge構造(Task 5,7)、skills=MCP prompts二重管理なし(Task 8)、エラー処理 `{data, warnings}`(Global + Task 1)、Hadesスモークテスト(各Task)、ITAD/Obscura任意キー(Task 4,6)。
- v1スコープ外(spec通り): `run_sim`、Cloudflare/sim.steamsonar.gg 配備、gameuidatabase一括取得。
- 型整合: `FetchResult<T>` をTask 1で定義し全タスクが同名でconsume。`GameProfile`/`Review`/`Timeline`/`Persona` は定義タスクのInterfaces欄の名前を後続タスクがそのまま使用。
