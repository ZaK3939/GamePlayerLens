# GamePlayerLens

Steam の実データに接地したゲーム開発コンサル用 MCP サーバーです。UI・ゲームシステム・価格・ローカライズを変えるたびに相談できる「変更の右腕」として、競合探索、根拠収集、ペルソナ素材生成、評価保存、過去相談の再読込を generic MCP client から完結できます。

## クライアント要件

必要なクライアント能力は次の3つです。

- MCP tools を呼べる
- MCP prompts を取得できる
- 標準 MCP `ImageContent` を表示するかモデルへ渡せる

ローカル filesystem tool、subagent、独自の画像読取 tool は任意です。subagent がなければ、同じモデルが領域ごとの independent pass を順番に実行できます。v1.1 が直接受ける対象入力は仕様テキストと HTTP(S) URL です。zip はクライアント側で展開し、必要なテキストを prompt の `specification` などへ渡してください。サーバーは zip や任意のローカルパスを読みません。

## 必要環境とセットアップ

- Node.js 20 以上
- pnpm 10 以上
- リポジトリルートからの実行

```bash
pnpm install
pnpm build
```

リポジトリ同梱の `.mcp.json` は `pnpm tsx src/index.ts` で stdio server を起動します。対応クライアントでこのリポジトリを開き、`game-player-lens` MCP server を有効にしてからクライアントを再起動してください。環境変数や `.mcp.json` を変えた場合も再起動が必要です。

### npm `bin`として使う

配布用packageは、リポジトリルートで次のように作成・インストールできます。

```bash
pnpm pack
npm install --global ./game-player-lens-0.1.0.tgz
game-player-lens
```

MCPクライアントからは次の設定で起動します。

```json
{
  "mcpServers": {
    "game-player-lens": {
      "command": "game-player-lens"
    }
  }
}
```

配布版CLIはcanonical template、rubric、recipeをnpm packageから読み、生成するpersona、intel、capture、evaluationをデフォルトで `~/.game-player-lens/` に保存します。保存先を変える場合は、MCP server環境へ絶対パスの `GAME_PLAYER_LENS_HOME` を設定してください。インストール先の `node_modules` にはユーザーデータを書きません。

接続確認はリポジトリルートで実行します。

```bash
pnpm build
pnpm smoke:stdio
pnpm smoke:stdio --live
```

`pnpm smoke:stdio` は dist の実 stdio 接続越しに、exactly 11 tools、2 prompts、prompt arguments、canonical knowledge、read-only artifact list、protocol の正常終了を検証します。`--live` はさらに `steam_search` と `steam_discover` を実 API で確認します。サーバー stdout は JSON-RPC 専用で、診断は stderr に出ます。

## 任意設定

外部キーとバイナリはどちらも任意です。未設定でもサーバーは起動し、該当 tool が取得手順を `warnings` に返します。空文字は未設定として扱います。`GAME_PLAYER_LENS_HOME` は配布版CLIの保存先設定であり、外部連携には使用しません。

```bash
export ITAD_API_KEY="your-isthereanydeal-api-key"
export OBSCURA_PATH="/absolute/path/to/obscura"
export GAME_PLAYER_LENS_HOME="/absolute/path/to/player-research-data"
```

- `ITAD_API_KEY`: IsThereAnyDeal の Steam 価格履歴に使用します。キーは [ITAD Apps](https://isthereanydeal.com/apps/my/) で作成します。
- `OBSCURA_PATH`: [Obscura](https://github.com/h4ckf0r0day/obscura) の実行ファイルです。localhost/loopback capture は `--allow-private-network` 対応の v0.1.6 以降を使用してください。未設定または capture 失敗時は `knowledge/ui-references/` への手動配置を案内します。
- `GAME_PLAYER_LENS_HOME`: npm `bin`実行時の可変データ保存先です。絶対パスだけを受け付け、未設定時は `~/.game-player-lens/` を使います。repo内から直接起動する場合は従来どおりrepo-local layoutを使います。

GUI クライアントは terminal の `export` を継承しない場合があります。その場合はクライアント自身の MCP server 設定へ環境変数を設定し、クライアントを完全に再起動してください。外部連携の設定項目は `ITAD_API_KEY` と `OBSCURA_PATH` の2つだけです。`.mcp.json` に空の env 値は書かず、利用できる場合は親プロセスの環境を継承します。

## Prompts と相談例

- `run-sim`: 対象理解、競合選定、persona 派生、領域別評価、批評、レポート保存までの実行レシピ
- `ui-blind-compare`: 対象 UI と参照 UI を匿名化し、正解開示前に評価を固定する比較レシピ

基本の入口は `run-sim` です。prompt arguments はすべて string です。クライアントの prompt UI で、たとえば次の値を渡します。

価格の baseline 相談:

```json
{
  "target": "Project Nyx",
  "topic": "Japan launch price",
  "mode": "baseline",
  "domains": "price,competition",
  "specification": "Premium roguelike。想定プレイ時間20時間。日本価格は未決定。",
  "competitors": "Hades, Dead Cells",
  "market": "Japan",
  "language": "Japanese",
  "qualityTier": "premium indie"
}
```

UI の change 相談:

```json
{
  "target": "Project Nyx",
  "topic": "Inventory navigation redesign",
  "mode": "change",
  "domains": "ui",
  "uiUrl": "http://127.0.0.1:4173/inventory",
  "currentState": "Tabs are text-only across the top; item details open in a modal.",
  "proposal": "Replace tabs with a left icon rail and persistent right-side details.",
  "competitors": "Hades II, Dead Cells",
  "qualityTier": "premium indie"
}
```

`mode=change` では `currentState` と `proposal` が必要です。不足時は評価開始前に確認質問を行う recipe になります。`domains` は `ui,price,localization,competition` の comma-separated list または `auto` です。UI が scope 外なら capture、blind compare、UI gate は N/A であり、不合格理由にはなりません。

## Tools

v1.1 の tool surface は次の exactly 11 tools です。

| Tool | 用途 |
|---|---|
| `steam_search` | 既知名から Steam appid 候補を検索 |
| `steam_fetch` | US / JP / Germany の価格、言語、タグ、レビュー統計、SteamSpy 情報を取得 |
| `steam_reviews` | 言語・極性・最低プレイ時間で recent review を取得 |
| `steam_timeline` | SteamSpy snapshot と任意の ITAD 価格履歴を取得 |
| `derive_personas` | 件数を調整できるレビュー出典、Persona JSON Schema、生成指示をまとめる |
| `save_persona` | 生成済み persona を検証し、原子的に保存 |
| `ui_capture` | Obscura CDP で HTTP(S) UI を PNG 保存し、上限内なら `ImageContent` も返す |
| `get_knowledge` | canonical templates、rubrics、personas、互換用 intel を一覧・取得 |
| `steam_discover` | SteamSpy のtag/genreを単独検索、または最大4条件で交差して競合候補を取得 |
| `save_artifact` | intel JSON または evaluation Markdown を安全かつ原子的に保存 |
| `get_artifact` | intel、evaluation、capture、ui-reference を一覧または読出し |

外部取得 tool は `{data, warnings, meta?}` を返します。一部の外部取得だけが失敗しても取得済みデータを維持します。入力違反と path 境界違反は tool error です。

`steam_discover` は `value` を主条件とし、任意の `additionalValues` 最大3件をすべて満たす候補だけを返せます。交差検索は各条件のSteamSpy上位50件を使い、各API順位の合計が小さい順に並べます。対象自身や既知の不適合候補は `excludeAppids` 最大50件で除外します。たとえばHades IIに近い候補は次の入力で探索できます。

```json
{
  "kind": "tag",
  "value": "Action Roguelike",
  "additionalValues": ["Rogue-lite", "Hack and Slash"],
  "excludeAppids": [1145350],
  "limit": 10
}
```

交差時の各候補には `matchedValues` と `sourceRanks` が付きます。これはSteamSpy tagの重なりであり、最終的な類似性保証ではないため、候補は `steam_fetch` で再検証してください。

### `save_artifact` / `get_artifact`

`save_artifact` は `kind=intel` のとき `target`、`id`、`sourceTool`、`observedAt`、`payload` を、`kind=evaluation` のとき `target`、`topic`、任意の `date`、`content` を受けます。両方とも `overwrite` の default は `false` で、同じ canonical path の既存ファイルを明示なしに変更しません。

`get_artifact` は read-only で、list/read semantics は次のとおりです。

| kind | arguments | 結果 |
|---|---|---|
| `intel` / `evaluation` | `target` なし | target ID 一覧 |
| `intel` / `evaluation` | `target` あり、`id` なし | artifact metadata 一覧 |
| `intel` / `evaluation` | `target` と `id` あり | JSON / Markdown 内容 |
| `capture` / `ui-reference` | `id` なし | PNG metadata 一覧 |
| `capture` / `ui-reference` | `id` あり | metadata と、6 MiB 以下の有効な PNG なら `ImageContent` |

text artifact の `id` 単独指定と、image artifact の `target` 指定は無効です。一覧 metadata は canonical ID、repo-relative path、size、更新時刻を返します。画像は client filesystem access なしで読めます。

## Artifact layout

```text
knowledge/intel/{targetId}/{artifactId}.json
workspaces/{targetId}/{date}-{topicId}.md
knowledge/intel/captures/{captureId}.png
knowledge/ui-references/{referenceId}.png
```

入力された表示名は安全な canonical ID へ正規化され、tool result に repo-relative path が返ります。任意 path、traversal、symlink 経由の root 外アクセスは受け付けません。intel payload は最大 1 MiB、evaluation は最大 512 KiB、inline PNG は最大 6 MiB です。

repo内の直接起動では上記layoutの起点はrepository rootです。npm `bin`では `GAME_PLAYER_LENS_HOME`、未設定なら `~/.game-player-lens` が起点です。toolが返すpathは、どちらの実行方式でもそのdata rootからの相対パスです。

## データの解釈

`derive_personas.reviewsPerPolarity` は1 appid・1極性あたり3〜25件を指定でき、既定値は後方互換の25件です。通常の3〜5 persona生成には8件、深掘り監査には25件を目安にしてください。Japanese-first で肯定・否定を同数収集し、appidと極性をラウンドロビンに並べるため、出力冒頭が単一ゲームや肯定だけに偏りません。

この素材は問題発見用の polarity-balanced sample です。`representative: false` であり、市場やレビュー母集団の比率を表しません。この50対50の設計比率から Flow size や adoption likelihood を推定せず、母集団の好評率には `steam_fetch.reviewStats` など別の根拠を使ってください。

SteamSpy の owners、CCU、playtime、review 系の値は推定または取得時点の snapshot です。owners は販売本数ではなく所有推定範囲で、recent release や小標本では特に不確かです。`average_forever=0` は欠損相当の reported zero として扱いますが、CCU 0 は有効な snapshot として保持します。

`steam_timeline.currentCcu` は `observedAt` 時点の現在値であり、24時間ピーク、史上最高、過去CCUではありません。ITAD の `priceHistory` とは時間軸も出典も分けて解釈してください。

## 検証

```bash
pnpm build
pnpm test
pnpm smoke:stdio
pnpm smoke:package
pnpm test:live
pnpm smoke:stdio --live
```

live test の固定 appid は Hades `1145360`、SteamSpy discovery tag は `Action Roguelike` です。`OBSCURA_PATH` がなければ manual ui-reference warning を検証し、設定済みなら localhost capture と `ImageContent` を検証します。`ITAD_API_KEY` がなければ timeline は `priceHistory: null` と設定 warning、設定済みなら履歴配列と currency を検証します。

## v1 から v1.1

v1 の既存8 tool 名と主要 input/output shape は互換です。`FetchResult.data` と `warnings` は維持され、`meta` が optional field として追加されました。`ui_capture` も既存 field を維持しつつ image metadata と標準 `ImageContent` を追加します。v1.1 の新規 tool は `steam_discover`、`save_artifact`、`get_artifact` です。canonical knowledge の既存 `get_knowledge` semantics は維持し、dynamic artifact の list/read は `get_artifact` を使用します。

現在の判断は [v1.1 設計](docs/superpowers/specs/2026-08-11-steam-user-sim-v1-1-user-workflow-design.md)、実装・検証条件は [v1.1 計画](docs/superpowers/plans/2026-08-11-steam-user-sim-v1-1-user-workflow.md) を参照してください。旧 [v1 設計](docs/superpowers/specs/2026-08-10-steam-user-sim-design.md) と [v1 計画](docs/superpowers/plans/2026-08-10-steam-user-sim.md) は履歴として残しています。npm `bin` packagingは実装済みです。過去CCUとremote deploymentは今後の対象です。
