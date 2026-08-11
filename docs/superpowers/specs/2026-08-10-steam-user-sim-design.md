# steam-user-sim 設計ドキュメント

Date: 2026-08-10
Status: Approved for v1 implementation

> **Historical v1 design:** 現在の active design は [v1.1 user workflow design](2026-08-11-steam-user-sim-v1-1-user-workflow-design.md) です。v1.1 は、generic MCP client に local filesystem・subagent・独自画像toolを必須とせず、標準 `ImageContent` と `save_artifact` / `get_artifact` で workflow を完結させます。v1 の8 tool名と主要data shapeは維持し、`meta` はoptional追加です。以下のうち、serverがzipを直接扱う前提はclient-side extractionへ、固定AAA基準は`qualityTier`相当の出荷済み製品との比較へ、dynamic intelの`get_knowledge`読出しは`get_artifact`へ supersede されました。過去CCU、npm `bin` packaging、remote deploymentは v1.2 以降へ移動しました。

## 目的

ゲーム開発コンサルツール。開発中のゲーム/プロダクト(企画書テキスト・ローカル実行URL・コードzip)を投げると、競合ゲームの実Steamレビューから派生したペルソナ群がシミュレーションでフィードバックを返し、実データ(UI・レビュー・現在CCU・価格展開タイムライン)に接地した adoption evaluation レポートを出力する。

対象は汎用(差し替え可能)。フィードバック領域: ペルソナ定義 / ゲームUI / 競合分析 / 価格帯 / ローカライズ。

## 利用シーン — 「変更の右腕」

一回きりの監査ツールではなく、開発中の意思決定のたびに相談する相手。典型的な相談:

- **UIを変えたい** — 変更案(スクショ/モック/テキスト)を投げる → ペルソナ反応 + 本物UI(gameuidatabase)とのブラインド比較
- **ゲームシステムを変えたい** — 仕様変更案を投げる → 競合の類似システムへの実レビュー反応を根拠にペルソナが評価
- **ローカライズしたい** — 対象言語・文言を投げる → その言語圏の実レビュー由来ペルソナが品質・期待値を評価
- **価格を変えたい** — 価格案を投げる → 競合の価格展開タイムライン・セール履歴を根拠に評価

いずれも入力は既存の3形式(テキスト仕様/URL/zip)に収まる。変更相談の場合、レポートは「現状 vs 変更案」の差分評価になる。`workspaces/<target>/` には相談ごとに `<date>-<topic>.md` で蓄積し、過去の相談が次の相談の文脈になる(ここが右腕たる所以: 履歴を持つ)。

## 参考資料と役割

| 参考 | 役割 |
|---|---|
| flovia/brain | リポジトリ構造: canonical ナレッジ + skills + workspaces。エージェントが読み書きする前提のrepo設計 |
| simile.com | コンセプト: AIペルソナによるユーザーフィードバックsim |
| scauditstudio (Agent Scan) | プロダクト形態: 対象を投げると監査レポートが返る |
| hyperamm trader-adoption-evaluation | 出力フォーマット: Flow別 × Volume driver / Friction / Retention / What we control + 総合 Adoption Likelihood |
| AAA品質プロンプト | 実行パターン: 領域別subagent並列 + 超辛口批評家の視覚チェック /loop + 本物とのブラインド比較、全員が納得するまで続行 |
| gameuidatabase.com | UIブラインド比較の「本物」側。Steam Sonar のゲーム詳細ページに各ゲームへのリンクあり |
| ZaK3939/steam-game-hub (Steam Sonar) | コード流用元: Steam Store API / SteamSpy 取得・正規化、急上昇検出(CCU/オーナー比)、日本語対応判定、メディアフィード、Chrome拡張 |
| h4ckf0r0day/obscura | Rust製軽量headlessブラウザ(anti-detect内蔵)。サーバー側スクショ取得エンジン |

## 決定事項

- 形態: **MCPサーバー**(TypeScript, MCP TypeScript SDK v2: `@modelcontextprotocol/server` / `@modelcontextprotocol/client`)
- 実行方式: **ハイブリッド、段階構築(案A)** — v1はナレッジ提供型(ペルソナの思考はクライアント側Claudeのsubagent+loopが担当)、v2でサーバー側並列simエンジン `run_sim` を追加
- v1入力: テキスト仕様/企画書、ローカル実行URL、手元のコードzip
- ペルソナ: 競合/類似ゲームの実Steamレビューから派生
- 状態管理: サーバーはstateレス、状態は全部ファイル(gitで追える平文)
- 実行範囲: v1はリポジトリルートから起動するrepo-local MCP。npmグローバル配布は対象外
- 配備: v1はローカルstdio。リモート公開時は **Cloudflare** 上で **sim.steamsonar.gg**(サブドメイン)。Workersにナレッジ/Steam系tool、Obscuraはネイティブバイナリのため Cloudflare Containers 側

## リポジトリレイアウト

```
steam-user-sim/
├── src/                      # MCPサーバー本体 (stdio)
│   ├── index.ts              # サーバー起動・tool/prompt登録
│   ├── http.ts               # timeout付きHTTP取得と部分成功の共通型
│   ├── paths.ts              # knowledge/intelへの安全なパス解決
│   ├── steam.ts              # Steam Store API / SteamSpy正規化 (Steam Sonarから移植)
│   ├── reviews.ts            # Steamレビュー取得・filter・文字化け除去
│   ├── timeline.ts           # 現在CCU + 価格履歴 (SteamSpy + IsThereAnyDeal)
│   ├── capture.ts            # Obscura経由のスクショ取得
│   └── personas.ts           # ペルソナ派生素材・保存・読み出し
├── knowledge/                # canonical ナレッジ (flovia/brain の canonical/ 相当)
│   ├── personas/             # 派生済みペルソナ (JSON, source_appids付き)
│   ├── templates/            # 評価テンプレ (hyperamm式 adoption-eval のゲーム翻案 ほか)
│   ├── rubrics/              # 辛口批評家の合格基準・ブラインド比較手順
│   ├── ui-references/        # 手動保存した本物UIスクショ (Obscura失敗時のフォールバック)
│   └── intel/                # 対象ごとの取得キャッシュ (競合スクショ・タイムライン・レビュー抜粋)
│       └── captures/         # ui_captureが生成したPNG
├── skills/                   # クライアント側実行レシピ。MCP prompts としても公開 (二重管理しない)
│   ├── run-sim.md            # ①〜⑥の手順書
│   └── ui-blind-compare.md   # 本物UIと並べる視覚比較手順
└── workspaces/               # 評価結果 (対象ごと・日付ごと)
    └── <target>/<date>-adoption-evaluation.md
```

## MCP tool 定義 (v1)

1. **`steam_search(query)`** — ゲーム名検索 → appid候補。競合指定の入口。タグ絞り込みは候補取得後の `steam_fetch` で行う。
2. **`steam_fetch(appid)`** — ストア情報一式: 名前、地域別価格(US/JP/GermanyをEuro圏代表値として明記)、対応言語、タグ、レビュー統計、スクリーンショットURL。Steam Store API + SteamSpy を1つのJSONに正規化。
3. **`steam_reviews(appid, opts?)`** — 実レビュー取得。言語・好評/不評・プレイ時間帯でフィルタ。
4. **`steam_timeline(appid, opts?)`** — SteamSpyの現在CCU/owners/平均プレイ時間スナップショット + IsThereAnyDealの期間指定価格・セール履歴。`since` はISO 8601、デフォルト1年。`country` はデフォルトUS。
5. **`derive_personas(appids[], count?)`** — レビュー群、出典、PersonaSchema、生成指示を含む派生素材パックを返す。思考とJSON生成はクライアント側Claudeが担当。
6. **`save_persona(persona, overwrite?)`** — 生成済みペルソナをzod検証し、安全かつ原子的に `knowledge/personas/` へ保存。既存IDはデフォルト上書き禁止。
7. **`ui_capture(url, opts?)`** — Obscuraでスクショ取得。保存先はサーバーが `knowledge/intel/captures/` 配下に生成する。`http:`/`https:`のみ許可し、localhostは対象UI確認のため許可。403等で失敗時は `knowledge/ui-references/` への手動配置を促すエラーメッセージ。
8. **`get_knowledge(kind, id?)`** — `personas` / `templates` / `rubrics` / `intel` の読み出し。

### ペルソナ スキーマ

```json
{
  "id": "jp-localization-hawk",
  "source_appids": [1234, 5678],
  "archetype": "日本語ローカライズ監視勢",
  "playtime_profile": "50-200h/年, JRPG・インディー中心",
  "priorities": ["日本語品質", "価格納得感", "UIの可読性"],
  "voice": [
    {
      "text": "実レビュー引用1",
      "source_appid": 1234,
      "recommendation_id": "123456789",
      "language": "japanese",
      "voted_up": false
    },
    {
      "text": "実レビュー引用2",
      "source_appid": 1234,
      "recommendation_id": "123456790",
      "language": "japanese",
      "voted_up": true
    },
    {
      "text": "実レビュー引用3",
      "source_appid": 5678,
      "recommendation_id": "123456791",
      "language": "japanese",
      "voted_up": false
    }
  ],
  "dealbreakers": ["機械翻訳", "フォント崩れ"],
  "price_sensitivity": "セール待ち型 / 定価買い型 など"
}
```

`voice` は3〜5件必須。引用本文だけでなくappid・Steam recommendation ID・言語・好評/不評を保持し、批評の根拠を追跡可能にする。

## データフロー — 1回の評価

```
入力 (企画書 / localhost URL / コードzip)
  ├─ ① 対象理解: クライアントClaudeが読む (URLは ui_capture で巡回スクショ)
  ├─ ② 競合特定: steam_search + steam_fetch + steam_timeline で類似3-5本の
  │     価格・言語・タグ・レビュー統計・現在CCU/価格タイムラインを取得 → knowledge/intel/
  ├─ ③ ペルソナ準備: steam_reviews → derive_personas → クライアントClaudeが生成
  │     → save_persona (2回目以降はget_knowledgeで再利用)
  ├─ ④ 領域別subagent並列: UI批評×ペルソナ / 価格帯 / ローカライズ / 競合分析
  │     各主張は②③の実データを根拠として引用する義務あり
  ├─ ⑤ 辛口批評家ループ: rubrics/ の基準で審査。UIは ui_capture した本物と
  │     ブラインド比較。「AAAに見えなければ続行」で /loop
  └─ ⑥ 出力: workspaces/<target>/<date>-<topic>.md (hyperamm式。変更相談なら現状vs変更案の差分評価)
```

## エラー処理

- 外部API(Steam/SteamSpy/ITAD)は落ちる前提。期待される外部失敗は各toolが部分成功 `{data, warnings}` を返す。simは欠けたデータで続行し、レポートに「根拠不足」を明記する。根拠の有無を隠さないことがコンサル品質。
- 入力スキーマ違反、許可ルート外のファイルアクセス、実装上の想定外例外はwarningへ隠さずMCP tool errorにする。
- knowledge/persona/captureのパスは共通resolverでbasename、拡張子、resolve後のroot containment、symlinkを検証する。MCP入力に任意の出力pathを公開しない。
- Obscura失敗時のフォールバック手順はエラーメッセージ自体に記載。

## テスト

- `pnpm test`: 外部ネットワークに依存しない正規化・schema・path・MCP契約テスト。HTTPを丸ごとmockせず、純粋な正規化関数へ固定入力を渡す。
- `pnpm test:live`: 各外部toolの実APIスモーク(固定appid: Hades=1145360)。手動リトライで成功扱いにせず、通常テストと失敗原因を分離する。
- `pnpm test:all`: 決定的テストとlive smokeを連続実行。
- canonical knowledgeは必須見出し・根拠欄・prompt内容をvitestで契約テストする。

## v1でやらないこと

- `run_sim`(サーバー側並列simエンジン)→ v2。プロンプトがクライアント側で熟成してから焼く。
- 過去CCU履歴・急上昇検出 → v1.2以降。v1.1もSteamSpy取得時点のスナップショットのみ。
- npmグローバル配布・package `bin` → v1.2以降。canonical knowledgeと可変データはrepo-localで運用する。
- リモート配備(sim.steamsonar.gg)→ v1.2以降。v1.1もローカルstdioで検証する。
- gameuidatabase の一括スクレイピング → 必要ページを都度 ui_capture。
