# steam-user-sim

Steam の実データに接地したゲーム開発コンサル用 MCP サーバーです。一回きりの監査ではなく、UI・ゲームシステム・価格・ローカライズを変えるたびに相談できる「変更の右腕」を目指します。

競合ゲームのストア情報、地域価格、レビュー、現在CCU、価格履歴を集め、出典を追跡できるペルソナ素材と canonical な評価テンプレートを提供します。ペルソナの生成・領域別評価・批評ループは MCP クライアント側で行い、結果は repo 内の平文ファイルとして残します。

## 必要環境

- Node.js 20 以上
- pnpm 10 以上
- リポジトリルートからの実行

```bash
pnpm install
pnpm build
```

v1 は repo-local 運用です。npm のグローバル `bin` としてのインストールには対応していません。

## MCP 接続

リポジトリ同梱の `.mcp.json` は次のコマンドでサーバーを起動します。

```text
pnpm tsx src/index.ts
```

対応クライアントからこのリポジトリを開き、`steam-user-sim` MCP server を有効にしてください。stdout は JSON-RPC 専用で、診断は stderr に出ます。

## 任意設定

外部キーとバイナリはどちらも任意です。未設定でもサーバーは起動し、該当 tool が取得手順を `warnings` に返します。空文字は未設定として扱います。

```bash
export ITAD_API_KEY="your-isthereanydeal-api-key"
export OBSCURA_PATH="/absolute/path/to/obscura"
```

- `ITAD_API_KEY`: IsThereAnyDeal の Steam 価格履歴に使用します。キーは [ITAD Apps](https://isthereanydeal.com/apps/my/) で作成します。
- `OBSCURA_PATH`: [Obscura](https://github.com/h4ckf0r0day/obscura) の実行ファイルです。未設定または capture 失敗時は `knowledge/ui-references/` への手動配置を案内します。

設定項目はこの2つだけです。`.mcp.json` に空の env 値は書かず、親プロセスの環境を継承します。

## Tools

| Tool | 用途 |
|---|---|
| `steam_search` | 名前から Steam appid 候補を検索 |
| `steam_fetch` | US / JP / Germany の価格、言語、タグ、レビュー統計を取得 |
| `steam_reviews` | 言語・極性・最低プレイ時間で recent review を取得 |
| `steam_timeline` | 現在CCUスナップショットと任意の ITAD 価格履歴を取得 |
| `derive_personas` | レビュー出典、Persona JSON Schema、生成指示をまとめる |
| `save_persona` | 生成済み persona を検証し、原子的に保存 |
| `ui_capture` | Obscura CDP で HTTP(S) UI を安全なサーバー生成先へ保存 |
| `get_knowledge` | templates、rubrics、personas、intel を一覧・取得 |

外部取得 tool は `{data, warnings}` を返します。JP価格や ITAD など一部だけ失敗した場合も、取得済みデータを捨てません。入力違反と path 境界違反は tool error です。

## Prompts

- `/run-sim`: 対象理解、競合選定、persona 派生、領域別評価、辛口批評、レポート保存までの実行レシピ
- `/ui-blind-compare`: 対象UIと本物UIを匿名化し、正解開示前に評価を固定する比較レシピ

基本の入口は `/run-sim` です。対象仕様またはURLと相談テーマを渡してください。変更相談では「現状 vs 変更案」の差分評価を `workspaces/<target>/<date>-<topic>.md` へ残します。

## 検証

```bash
pnpm test          # ネットワーク非依存の決定論的テスト
pnpm test:live     # Hades appid 1145360 を使う実 API スモーク
pnpm test:all      # 上記2本を連続実行
pnpm build
pnpm smoke:stdio   # dist/index.js を実 spawn して MCP 接続を確認
pnpm smoke:stdio --live  # 同じ接続越しに steam_search も確認
```

`OBSCURA_PATH` がない環境では Obscura live capture だけを skip し、手動 fallback の決定論的テストを実行します。`ITAD_API_KEY` がなければ、timeline live test は履歴が `null` で設定 warning があることを検証します。

設計判断と v1 の非対象は [設計ドキュメント](docs/superpowers/specs/2026-08-10-steam-user-sim-design.md)、タスク単位の検証条件は [実装計画](docs/superpowers/plans/2026-08-10-steam-user-sim.md) を参照してください。
