# steam-user-sim v1 Implementation Plan

**Status:** 2026-08-11 実装・検証完了。各Stepのコミットとend-to-end gateを確認済み。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Completed steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** ゲーム開発コンサル用MCPサーバー v1 — Steamデータ取得・ペルソナ派生/保存・UIキャプチャの8 tool + canonical ナレッジ + 実行レシピ(MCP prompts)。

**Architecture:** stateレスなrepo-local stdio MCPサーバー。状態は全部ファイル(`knowledge/`, `workspaces/`)。ペルソナの思考とJSON生成はクライアント側Claudeが担当し、サーバーは根拠データ、schema、安全な保存境界を提供する(spec 案A)。

**Tech Stack:** TypeScript (Node 20+, ESM), MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`), `zod` v4, `vitest`。外部API: Steam Store API / SteamSpy / IsThereAnyDeal (キー任意) / Obscura (バイナリ任意)。

## Global Constraints

- パッケージマネージャはpnpm。ESM (`"type": "module"`)。lockfileをコミットする。
- 任意設定は `ITAD_API_KEY` と `OBSCURA_PATH` の2つのみ。前者はAPIキー、後者はバイナリパス。空文字は未設定として扱う。
- 外部サービスの期待される失敗は `{data, warnings: string[]}` で返し、部分成功を隠さない。入力違反・パス境界違反・想定外例外はMCP tool errorにする。
- `fetchJson`を使う外部HTTPは8000ms timeout。Obscuraのブラウザnavigationは別枠で15000ms timeout。
- v1はリポジトリルートから起動するrepo-local MCP。npm `bin` 配布はv1.1へ送る。
- `knowledge/`、`skills/`、`workspaces/`へのアクセスは共通path resolver経由に限定する。
- 決定的テストは `pnpm test`、実APIスモークは `pnpm test:live`、両方は `pnpm test:all`。固定appidは **Hades = 1145360**。
- HTTP client全体はmockしない。外部応答の正規化を純粋関数へ分離し、固定fixtureで分岐をテストする。live smokeは手動リトライで成功扱いにしない。
- `knowledge/`配下のドキュメントは日本語。コードのコメント・識別子は英語。

---

### Task 1: scaffold + HTTP/パス/結果型の共通基盤

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `vitest.live.config.ts`, `src/http.ts`, `src/paths.ts`
- Test: `src/http.test.ts`, `src/paths.test.ts`

**Interfaces:**
- Produces:
  - `FetchResult<T> = {data: T | null; warnings: string[]}`
  - `fetchJson<T>(url: string | URL, opts?: {timeoutMs?: number; source?: string}): Promise<FetchResult<T>>`
  - `createPathResolver(root: string)` — 明示されたtrusted root配下だけを解決する。テストは一時root、productionは検出済みrepo rootを渡す。
  - default resolverの `resolveKnowledgePath(kind, id)` / `resolvePersonaPath(id)` / `resolveCapturePath(name?)`

- [x] **Step 1: scaffold**

```bash
pnpm init
pnpm add @modelcontextprotocol/server@^2 @modelcontextprotocol/client@^2 zod@^4.2
pnpm add -D typescript vitest @types/node tsx
```

`package.json`へ追記:

```json
{
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run --config vitest.config.ts",
    "test:live": "RUN_LIVE=1 vitest run --config vitest.live.config.ts",
    "test:all": "pnpm test && pnpm test:live"
  }
}
```

`vitest.config.ts`は`src/**/*.test.ts`をincludeし、`src/**/*.live.test.ts`をexclude。`vitest.live.config.ts`はlive testだけをincludeする。

`tsconfig.json`は`target: ES2022`、`module/moduleResolution: NodeNext`、`strict: true`、`outDir: dist`、`rootDir: src`とする。

- [x] **Step 2: failing tests**

`src/http.test.ts`はNodeのloopback HTTP serverを起動し、200 JSON、HTTP 500、不正JSON、timeoutを検証する。global `fetch`は差し替えない。

`src/paths.test.ts`は`mkdtempSync(join(tmpdir(), "steam-user-sim-"))`で専用rootを作り、次を検証する。

```ts
it.each(["..", "../x", "../../etc/passwd", "a/b", ".hidden"])(
  "rejects traversal-like id: %s",
  (id) => expect(() => resolver.resolveKnowledgePath("rubrics", id)).toThrow(),
);

expect(resolver.resolveKnowledgePath("rubrics", "harsh-critic.md"))
  .toMatch(/knowledge[/\\]rubrics[/\\]harsh-critic\.md$/);
expect(() => resolver.resolvePersonaPath("../escape")).toThrow();
expect(resolver.resolvePersonaPath("jp-localization-hawk")).toMatch(/\.json$/);
```

作成した一時rootだけを`afterAll`で削除する。

- [x] **Step 3: run, verify FAIL** — `pnpm test` → modules not found

- [x] **Step 4: implement**

`fetchJson`は非2xx、JSON parse、AbortSignal timeout、network errorを`data:null`へ変換する。warningにAPI keyやURL query全体を含めず、`source`またはhostと失敗種別だけを入れる。

`src/paths.ts`は以下を必須にする。

- production rootは`knowledge/`と`skills/`が存在する現在のrepo root。見つからなければ起動時に明示エラー。
- knowledge idは`path.basename(id) === id`、`.`/`..`拒否、kindごとの拡張子制限。
- persona idは `/^[a-z0-9][a-z0-9_-]{0,63}$/i`。
- `path.resolve()`後に`root + path.sep`でcontainmentを再確認。
- captureはサーバー生成名をデフォルトにし、`knowledge/intel/captures/`以外へ出さない。
- 既存ファイルを読む場合はsymlink経由でroot外へ出ないことも確認する。

- [x] **Step 5: run, verify PASS** — `pnpm test`
- [x] **Step 6: Commit** — `feat: scaffold + safe http and path foundations`

---

### Task 2: `steam_search` / `steam_fetch` データ層

**Files:**
- Create: `src/steam.ts`
- Test: `src/steam.test.ts`, `src/steam.live.test.ts`

**Interfaces:**
- Consumes: `fetchJson` (Task 1)
- Produces:
  - `searchGames(query: string): Promise<FetchResult<SearchHit[]>>`
  - `fetchGame(appid: number): Promise<FetchResult<GameProfile>>`
  - `normalizeStoreDetails(...)` / `normalizeSteamSpy(...)` — fixtureで検証する純粋関数

```ts
interface SearchHit {
  appid: number;
  name: string;
}

interface RegionPrice {
  countryCode: "us" | "jp" | "de";
  currency: string;
  finalFormatted: string;
  discountPercent: number;
}

interface GameProfile {
  appid: number;
  name: string;
  shortDescription: string;
  releaseDate: string;
  isFree: boolean;
  tags: string[];
  genres: string[];
  languages: string[];
  prices: Record<"us" | "jp" | "eu", RegionPrice | null>;
  reviewStats: {positive: number; negative: number; positivePercent: number} | null;
  ccu: number | null;
  owners: string | null;
  screenshots: string[];
}
```

Steam Store appdetailsを`cc=us|jp|de`で3回、SteamSpy appdetailsを1回、`Promise.all`で取得する。`eu`はGermany代表値であり、`countryCode:"de"`を保持する。v1の検索は名前だけとし、タグは`steam_fetch`後にクライアント側で絞る。

- [x] **Step 1: failing deterministic tests**
  - supported_languagesのHTML/`*`除去
  - 3地域価格の正規化とGermany代表コード
  - `is_free=true`のprice欠落は正常なnullで、障害warningにしない
  - 未発売/地域制限/HTTP失敗によるprice欠落はwarningで区別
  - SteamSpy tags/owners/ccu/positive/negative
  - positive+negative=0ならpositivePercentを0除算せずnull扱い

- [x] **Step 2: failing live smoke**

`src/steam.live.test.ts`は`RUN_LIVE=1`時だけ実行し、`searchGames("Hades")`が1145360を含むこと、`fetchGame(1145360)`がname、Japanese、JPY、複数tagを返すことを確認する。可変値のCCUやレビュー件数そのものは固定値assertしない。

- [x] **Step 3: run, verify FAIL** — `pnpm test`
- [x] **Step 4: implement** — US Store失敗だけ全体null。JP/DE/SteamSpy失敗は取得済みデータとwarningを返す。
- [x] **Step 5: run, verify PASS** — `pnpm test`後に`pnpm test:live`
- [x] **Step 6: Commit** — `feat: steam data layer (search + fetch)`

---

### Task 3: `steam_reviews` データ層

**Files:**
- Create: `src/reviews.ts`
- Test: `src/reviews.test.ts`, `src/reviews.live.test.ts`

**Interfaces:**
- Consumes: `fetchJson` (Task 1)
- Produces:

```ts
interface Review {
  recommendationId: string;
  review: string;
  votedUp: boolean;
  playtimeHours: number;
  language: string;
  timestamp: number;
}

function fetchReviews(
  appid: number,
  opts?: {
    language?: string;
    type?: "all" | "positive" | "negative";
    minPlaytimeHours?: number;
    limit?: number;
  },
): Promise<FetchResult<Review[]>>;
```

Steam reviews APIは`filter=recent`、初回cursor=`*`、次ページは応答cursorをURLエンコードする。`limit`はデフォルト100、最大300で、**全filter適用後**の返却件数。最大3ページ/生レビュー300件まで走査し、limit未達なら取得済みデータとwarningを返す。`recommendationid`で重複除去する。

文字化け対策は簡易版のみ: 制御文字 `/[\x00-\x08\x0B\x0C\x0E-\x1F]/g` と `?{3,}` を除去する。

- [x] **Step 1: failing deterministic tests**
  - 制御文字と`???`除去
  - `author.playtime_forever`の分→小数1桁の時間
  - positive/negative mapping
  - minPlaytime適用後にlimitへ達するまで次ページを処理
  - recommendationId重複除去
  - 300件capとlimit未達warning

- [x] **Step 2: failing live smoke** — HadesのJapanese negative reviewを最大20件取得し、votedUp=false、playtimeHours number、recommendationId非空を確認する。
- [x] **Step 3: run, verify FAIL**
- [x] **Step 4: implement**
- [x] **Step 5: run, verify PASS** — `pnpm test` + `pnpm test:live`
- [x] **Step 6: Commit** — `feat: review fetcher with traceable filtered reviews`

---

### Task 4: `steam_timeline` — 現在CCU + 期間指定価格履歴

**Files:**
- Create: `src/timeline.ts`
- Test: `src/timeline.test.ts`, `src/timeline.live.test.ts`

**Interfaces:**
- Consumes: `fetchJson` (Task 1)
- Produces:

```ts
interface Timeline {
  observedAt: string;
  currentCcu: number | null;
  owners: string | null;
  avgPlaytimeHours: number | null;
  priceHistory: Array<{
    date: string;
    amount: number;
    currency: string;
    discountPercent: number;
  }> | null;
  priceHistorySince: string | null;
  country: string;
}

function fetchTimeline(
  appid: number,
  opts?: {since?: string; country?: string},
): Promise<FetchResult<Timeline>>;
```

SteamSpyは取得時点のCCU/owners/average_foreverスナップショットだけを提供するものとして扱う。v1では過去CCUや急上昇を返さない。`average_forever`は分から時間へ正規化する。

ITAD API:

1. `games/lookup/v1?key=K&appid=N` → `found`と`game.id`
2. `games/history/v2?key=K&id=UUID&shops=61&country=US&since=ISO`

`since`はISO 8601、未指定時は現在から365日前。`country`はISO 3166-1 alpha-2大文字、デフォルトUS。API応答のamount/currencyを保持し、USD変換しない。URLは`URL`/`URLSearchParams`で組み立て、keyをwarningへ出さない。

- [x] **Step 1: failing deterministic tests**
  - currentCcuとobservedAt
  - average_foreverの分→時間
  - ITAD通貨保持、discount cut mapping、デフォルトsince
  - lookup `found:false`
  - `ITAD_API_KEY`なしはpriceHistory:null + 取得手順warning
  - SteamSpy失敗でもITAD成功データを返す部分成功

- [x] **Step 2: failing live smoke** — HadesのcurrentCcuをnumberとして確認。ITAD keyありなら履歴・currency、なしならnullとwarningを確認。
- [x] **Step 3: run, verify FAIL**
- [x] **Step 4: implement**
- [x] **Step 5: run, verify PASS** — `pnpm test` + `pnpm test:live`
- [x] **Step 6: Commit** — `feat: current ccu snapshot + bounded price timeline`

---

### Task 5: personas — schema・派生素材・安全な保存

**Files:**
- Create: `src/personas.ts`, `knowledge/personas/.gitkeep`
- Test: `src/personas.test.ts`, `src/personas.live.test.ts`

**Interfaces:**
- Consumes: `fetchReviews` (Task 3), `fetchGame` (Task 2), safe path resolver (Task 1)
- Produces:

```ts
const VoiceEvidenceSchema = z.object({
  text: z.string().min(1),
  source_appid: z.number().int().positive(),
  recommendation_id: z.string().min(1),
  language: z.string().min(1),
  voted_up: z.boolean(),
});

const PersonaSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  source_appids: z.array(z.number().int().positive()).min(1),
  archetype: z.string().min(1),
  playtime_profile: z.string().min(1),
  priorities: z.array(z.string().min(1)).min(1),
  voice: z.array(VoiceEvidenceSchema).min(3).max(5),
  dealbreakers: z.array(z.string().min(1)),
  price_sensitivity: z.string().min(1),
});
```

- `buildDerivationPack(appids: number[], count = 5)` — appidsとcountは各1〜12。`{requestedCount, schema, games, reviews, instruction}`を返す。schemaはzod v4からJSON Schemaへ変換する。
- `savePersona(persona, {overwrite=false}?)` — validate後、同一ディレクトリの一時ファイルへwriteする。`overwrite:false`はtemp→destinationのhard linkで「既存なら失敗」を原子的に保証してtempをunlinkし、`overwrite:true`はrenameで原子的に置換する。
- `listPersonas()` / `loadPersona(id)` — 読込時にもPersonaSchemaで検証する。

派生素材は各ゲームについてJapanese positive 25件 + negative 25件を優先する。不足分だけall-languageから補い、`recommendationId`で日本語分との重複を除く。ゲーム/極性ごとに不足warningを残す。countはサーバー生成数ではなく、クライアントへの生成指示と検証期待値に使う。

- [x] **Step 1: failing deterministic tests**
  - voice 2件/6件/出典欠落をreject
  - save/load round-tripはTask 1の`createPathResolver(tempRoot)`を注入したstoreで行う
  - traversal IDと既存ID上書きをreject
  - `overwrite:true`は更新できる
  - write/rename失敗時に対象一時ファイルだけcleanup
  - Japanese→all fallbackが重複せずpositive/negativeを必要数まで補う
  - count 0/13をrejectし、default 5をpackへ含める

- [x] **Step 2: failing live smoke** — Hadesのpackがレビュー10件以上、requestedCount=5、recommendationId重複なし、instructionに`save_persona`を含むことを確認。
- [x] **Step 3: run, verify FAIL**
- [x] **Step 4: implement**
- [x] **Step 5: run, verify PASS** — `pnpm test` + `pnpm test:live`
- [x] **Step 6: Commit** — `feat: traceable persona derivation and safe storage`

---

### Task 6: `ui_capture` — 安全なObscura CDPスクリーンショット

**Files:**
- Create: `src/capture.ts`
- Test: `src/capture.test.ts`, `src/capture.live.test.ts`
- Modify: `package.json` (`pnpm add puppeteer-core`)

**Interfaces:**
- Consumes: safe path resolver (Task 1)
- Produces:

```ts
function captureUrl(
  url: string,
  opts?: {
    name?: string;
    viewport?: {width: number; height: number};
    fullPage?: boolean;
  },
): Promise<FetchResult<{
  path: string;
  url: string;
  capturedAt: string;
}>>;
```

- URLは`http:`/`https:`のみ。localhost/loopbackは対象UI確認のため許可。`file:`/`data:`/`javascript:`等は入力エラー。
- `name`はファイル名のヒントでありpathではない。安全なslugへ変換し、出力は必ず`knowledge/intel/captures/`配下のPNG。
- `OBSCURA_PATH`なしはdata:nullとinstall/manual fallback warning。
- 起動は `OBSCURA_PATH serve --port N`。localhost/loopback対象時だけ`--allow-private-network`を追加する。接続先は`ws://127.0.0.1:N/devtools/browser`。

- [x] **Step 1: failing deterministic tests**
  - 未設定warning
  - unsafe scheme拒否
  - `name=../../x`でもroot外へ出ず、安全名になるか入力拒否
  - viewport bounds (320〜3840 × 240〜2160)
  - default fullPage=true

- [x] **Step 2: failing live smoke** — `RUN_LIVE=1 && OBSCURA_PATH`時だけexample.comをcaptureし、許可root配下のPNGと非zero sizeを確認後、対象ファイルだけ削除。

- [x] **Step 3: run, verify FAIL**
- [x] **Step 4: implement**
  - loopbackの空きportを選び、対象URLがlocalhost/loopbackの場合だけ`--allow-private-network`を付けてspawn
  - stdout/stderrはbufferへ捕捉し、MCPのprocess.stdoutへpipeしない
  - 8秒以内でPuppeteer connectを短間隔retry
  - viewport設定、`page.goto(..., {waitUntil:"networkidle2", timeout:15000})`、full-page screenshot
  - `browser.disconnect()`と子プロセス終了を`finally`で保証。終了猶予後も残る場合だけ対象PIDへSIGKILL
  - 失敗warningに手動配置先を含め、捕捉ログから秘密情報や長大HTMLを返さない

- [x] **Step 5: run, verify PASS** — `pnpm test`; Obscura環境では`pnpm test:live`
- [x] **Step 6: Commit** — `feat: safe obscura cdp capture with manual fallback`

---

### Task 7: canonical ナレッジ + 実行レシピ

**Files:**
- Create: `knowledge/templates/adoption-eval.md`, `knowledge/rubrics/harsh-critic.md`, `skills/run-sim.md`, `skills/ui-blind-compare.md`, `knowledge/ui-references/.gitkeep`, `knowledge/intel/.gitkeep`, `knowledge/intel/captures/.gitkeep`, `workspaces/.gitkeep`
- Test: `src/knowledge-content.test.ts`

**Interfaces:**
- Produces: Task 8の`get_knowledge`とMCP promptsが読むcanonicalファイル群。

- [x] **Step 1: failing content contract test**
  - adoption templateの必須5セクション
  - 各領域の根拠欄と「根拠不足」規則
  - rubricの根拠/ブラインド/voice出典要件
  - run-simの8 tool名と`derive_personas → save_persona`
  - 2 promptファイルが非空

- [x] **Step 2: `knowledge/templates/adoption-eval.md`**
  1. `Overall Assessment` (Adoption Likelihood / Initial Friction / Retention Potential / Key Blocking Factors)
  2. `Who Plays and Why — Flow Analysis`。各FlowにVolume driver / Friction / Retention / Current size / What we control
  3. `Flow Summary`表
  4. UI / 価格 / ローカライズ / 競合の領域別所見。各主張に`knowledge/intel/`相対リンクまたはtool取得値。なければ「根拠不足」
  5. 変更相談は全セクションを「現状 vs 変更案」の差分形式

- [x] **Step 3: `knowledge/rubrics/harsh-critic.md`**
  - 根拠なし主張が1つでもあれば差し戻し
  - UIは本物スクショとのブラインド比較でAAAに見えなければ続行
  - persona発言が`voice[].text`と矛盾、または`source_appid`/`recommendation_id`欠落なら差し戻し
  - 全領域subagentが合格するまでloop。ただし同一指摘の反復時は根拠不足として停止条件を明記

- [x] **Step 4: `skills/run-sim.md`** — 対象理解→競合特定→derive_personas→JSON生成→save_persona→領域別subagent→辛口批評→workspaces出力。
- [x] **Step 5: `skills/ui-blind-compare.md`** — 本物UIと対象UIを匿名化して提示し、正解を明かす前に比較結果を固定する手順。
- [x] **Step 6: run, verify PASS** — `pnpm test`
- [x] **Step 7: Commit** — `docs: canonical knowledge (templates, rubrics, run recipes)`

---

### Task 8: MCP v2サーバー組み立て — 8 tools / 2 prompts

**Files:**
- Create: `src/index.ts`, `src/knowledge.ts`
- Test: `src/index.test.ts`

**Interfaces:**
- Consumes: Task 1-7の全export
- Produces:
  - tools: `steam_search`, `steam_fetch`, `steam_reviews`, `steam_timeline`, `derive_personas`, `save_persona`, `ui_capture`, `get_knowledge`
  - prompts: `run-sim`, `ui-blind-compare`

- [x] **Step 1: `src/knowledge.ts` failing tests**
  - idなし一覧
  - rubric本文取得
  - persona一覧にarchetype
  - persona読込時schema検証
  - traversal/symlink拒否

パスはTask 1のresolverだけを使い、独自の`join(root, input)`を禁止する。

- [x] **Step 2: MCP contract failing tests**

MCP SDK v2の`Client`と、`@modelcontextprotocol/server`から読み込んだ`InMemoryTransport.createLinkedPair()`を使う。各testは`try/finally`でclient/serverをcloseする。

次を件数ではなく完全一致で検証する。

```ts
expect(toolNames.sort()).toEqual([
  "derive_personas",
  "get_knowledge",
  "save_persona",
  "steam_fetch",
  "steam_reviews",
  "steam_search",
  "steam_timeline",
  "ui_capture",
]);

expect(promptNames.sort()).toEqual(["run-sim", "ui-blind-compare"]);
```

さらに各input/output schemaの必須項目、`derive_personas.count`範囲、`ui_capture`に`outPath`がないこと、`save_persona → get_knowledge` round-trip、path違反がtool errorになることを検証する。

- [x] **Step 3: run, verify FAIL**

- [x] **Step 4: implement**
  - `buildServer()`はMCP SDK v2の`McpServer`を組み立ててreturn
  - 各toolにzod v4 input/output schemaを登録
  - 成功は`structuredContent: {data, warnings}`と、同内容のtext contentを返す
  - 外部サービスの期待失敗だけenvelope化。入力/パス/想定外例外は`isError` tool result
  - promptsは`skills/*.md`を単一sourceとして返す
  - 直接実行時だけ`serveStdio(buildServer)`を呼ぶ
  - stdoutはJSON-RPC専用。診断ログはstderr

- [x] **Step 5: run, verify PASS** — `pnpm test`
- [x] **Step 6: Commit** — `feat: mcp v2 server wiring (8 tools, 2 prompts)`

---

### Task 9: README + build成果物の接続スモーク

**Files:**
- Create: `README.md`, `.mcp.json`, `scripts/smoke-stdio.ts`
- Modify: `package.json` (`"smoke:stdio": "tsx scripts/smoke-stdio.ts"`)

**Interfaces:**
- Consumes: 全タスク

- [x] **Step 1: `.mcp.json`**

```json
{
  "mcpServers": {
    "steam-user-sim": {
      "command": "pnpm",
      "args": ["tsx", "src/index.ts"]
    }
  }
}
```

空文字envは置かない。`ITAD_API_KEY`/`OBSCURA_PATH`は親プロセス環境から継承し、未設定時の動作をtool warningで案内する。

- [x] **Step 2: README**
  - 「変更の右腕」という目的
  - repo rootからの`pnpm install`
  - 任意設定2つのexport方法
  - 8 tools / 2 prompts
  - `/run-sim`起点の流れ
  - `pnpm test` / `test:live` / `test:all` / `smoke:stdio`
  - design specへのリンク
  - v1はグローバル`bin`非対応

- [x] **Step 3: `scripts/smoke-stdio.ts`**
  - `Client` + `StdioClientTransport`で`node dist/index.js`を実際にspawn
  - cwdは検証済みrepo root
  - initialize、8 tools、2 prompts、`get_knowledge`を確認
  - stdoutにJSON-RPC以外が混ざれば接続失敗として検出
  - `finally`でclientをclose

- [x] **Step 4: end-to-end gate**

```bash
pnpm build
pnpm test
pnpm smoke:stdio
pnpm test:live
```

live実行可能環境では4本すべてを通す。キー/Obscuraなしでもそれぞれのfallback smokeは通る。最後にClaude Codeから`steam_search`と`get_knowledge`を1回ずつ呼ぶ。

- [x] **Step 5: Commit** — `docs: readme + repo-local mcp connection smoke`

---

## Self-Review Checklist

- toolは8個で、`derive_personas → save_persona`がクライアントから完結する。
- persona voiceは3〜5件の出典付き実レビュー引用。
- `steam_timeline`は過去CCUを装わず、現在スナップショットと期間明示の価格履歴を返す。
- knowledge/persona/captureは共通safe path resolverだけを使用し、任意出力pathをMCPへ公開しない。
- Obscuraは`serve --port` +既知のCDP endpointで接続し、子プロセスを必ず終了する。
- MCPはv2 package/`serveStdio`を使用し、stdoutを汚さない。
- `pnpm test`、`test:live`、`smoke:stdio`の責務が分離され、上流障害を手動リトライで成功扱いにしない。
- v1スコープ外: 過去CCU/急上昇、npm `bin`、サーバー側`run_sim`、Cloudflare配備、gameuidatabase一括取得。
