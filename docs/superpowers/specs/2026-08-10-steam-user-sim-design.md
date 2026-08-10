# steam-user-sim 設計ドキュメント

Date: 2026-08-10
Status: Draft (user review待ち)

## 目的

ゲーム開発コンサルツール。開発中のゲーム/プロダクト(企画書テキスト・ローカル実行URL・コードzip)を投げると、競合ゲームの実Steamレビューから派生したペルソナ群がシミュレーションでフィードバックを返し、実データ(UI・レビュー・実CCU・価格展開タイムライン)に接地した adoption evaluation レポートを出力する。

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

- 形態: **MCPサーバー**(TypeScript, `@modelcontextprotocol/sdk`)
- 実行方式: **ハイブリッド、段階構築(案A)** — v1はナレッジ提供型(ペルソナの思考はクライアント側Claudeのsubagent+loopが担当)、v2でサーバー側並列simエンジン `run_sim` を追加
- v1入力: テキスト仕様/企画書、ローカル実行URL、手元のコードzip
- ペルソナ: 競合/類似ゲームの実Steamレビューから派生
- 状態管理: サーバーはstateレス、状態は全部ファイル(gitで追える平文)
- 配備: v1はローカルstdio。リモート公開時は **Cloudflare** 上で **sim.steamsonar.gg**(サブドメイン)。Workersにナレッジ/Steam系tool、Obscuraはネイティブバイナリのため Cloudflare Containers 側

## リポジトリレイアウト

```
steam-user-sim/
├── src/                      # MCPサーバー本体 (stdio)
│   ├── index.ts              # サーバー起動・tool/prompt登録
│   ├── steam.ts              # Steam Store API / SteamSpy / レビュー取得 (Steam Sonarから移植)
│   ├── timeline.ts           # CCU履歴 + 価格展開 (SteamSpy + IsThereAnyDeal)
│   ├── capture.ts            # Obscura経由のスクショ取得
│   └── personas.ts           # ペルソナ派生素材・保存・読み出し
├── knowledge/                # canonical ナレッジ (flovia/brain の canonical/ 相当)
│   ├── personas/             # 派生済みペルソナ (JSON, source_appids付き)
│   ├── templates/            # 評価テンプレ (hyperamm式 adoption-eval のゲーム翻案 ほか)
│   ├── rubrics/              # 辛口批評家の合格基準・ブラインド比較手順
│   ├── ui-references/        # 手動保存した本物UIスクショ (Obscura失敗時のフォールバック)
│   └── intel/                # 対象ごとの取得キャッシュ (競合スクショ・タイムライン・レビュー抜粋)
├── skills/                   # クライアント側実行レシピ。MCP prompts としても公開 (二重管理しない)
│   ├── run-sim.md            # ①〜⑥の手順書
│   └── ui-blind-compare.md   # 本物UIと並べる視覚比較手順
└── workspaces/               # 評価結果 (対象ごと・日付ごと)
    └── <target>/<date>-adoption-evaluation.md
```

## MCP tool 定義 (v1)

1. **`steam_search(query, tags?)`** — ゲーム名/タグ検索 → appid候補。競合指定の入口。
2. **`steam_fetch(appid)`** — ストア情報一式: 名前、地域別価格(US/JP/EU等)、対応言語、タグ、レビュー統計、スクリーンショットURL。Steam Store API + SteamSpy を1つのJSONに正規化。
3. **`steam_reviews(appid, opts?)`** — 実レビュー取得。言語・好評/不評・プレイ時間帯でフィルタ。
4. **`steam_timeline(appid)`** — CCU履歴(SteamSpy + Steam Sonar急上昇ロジック)+ 価格展開・セール履歴(IsThereAnyDeal API、無料キー。唯一の外部キー)。
5. **`derive_personas(appids[], count?)`** — レビュー群からペルソナ派生素材パックを返し、生成済みペルソナJSONを `knowledge/personas/` に保存。
6. **`ui_capture(url)`** — Obscuraでスクショ取得。gameuidatabase のゲーム別ページ(URLは Steam Sonar 詳細ページのリンクから解決)、競合Steamストアページ、対象のlocalhost URL。403等で失敗時は `knowledge/ui-references/` への手動配置を促すエラーメッセージ。
7. **`get_knowledge(kind, id?)`** — `personas` / `templates` / `rubrics` / `intel` の読み出し。

### ペルソナ スキーマ

```json
{
  "id": "jp-localization-hawk",
  "source_appids": [1234, 5678],
  "archetype": "日本語ローカライズ監視勢",
  "playtime_profile": "50-200h/年, JRPG・インディー中心",
  "priorities": ["日本語品質", "価格納得感", "UIの可読性"],
  "voice": "実レビューからの引用3-5件(口調・語彙の根拠)",
  "dealbreakers": ["機械翻訳", "フォント崩れ"],
  "price_sensitivity": "セール待ち型 / 定価買い型 など"
}
```

## データフロー — 1回の評価

```
入力 (企画書 / localhost URL / コードzip)
  ├─ ① 対象理解: クライアントClaudeが読む (URLは ui_capture で巡回スクショ)
  ├─ ② 競合特定: steam_search + steam_fetch + steam_timeline で類似3-5本の
  │     価格・言語・タグ・レビュー統計・CCU/価格タイムラインを取得 → knowledge/intel/
  ├─ ③ ペルソナ準備: steam_reviews → derive_personas (2回目以降は再利用)
  ├─ ④ 領域別subagent並列: UI批評×ペルソナ / 価格帯 / ローカライズ / 競合分析
  │     各主張は②③の実データを根拠として引用する義務あり
  ├─ ⑤ 辛口批評家ループ: rubrics/ の基準で審査。UIは ui_capture した本物と
  │     ブラインド比較。「AAAに見えなければ続行」で /loop
  └─ ⑥ 出力: workspaces/<target>/<date>-<topic>.md (hyperamm式。変更相談なら現状vs変更案の差分評価)
```

## エラー処理

- 外部API(Steam/SteamSpy/ITAD)は落ちる前提。各toolは部分成功 `{data, warnings}` を返す。simは欠けたデータで続行し、レポートに「根拠不足」を明記する。根拠の有無を隠さないことがコンサル品質。
- Obscura失敗時のフォールバック手順はエラーメッセージ自体に記載。

## テスト

- 各toolに実APIスモークテスト1本(固定appid: Hades=1145360)+ ペルソナJSONスキーマ検証。vitestのみ、フレームワーク最小。

## v1でやらないこと

- `run_sim`(サーバー側並列simエンジン)→ v2。プロンプトがクライアント側で熟成してから焼く。
- リモート配備(sim.steamsonar.gg)→ v1動作確認後。
- gameuidatabase の一括スクレイピング → 必要ページを都度 ui_capture。
