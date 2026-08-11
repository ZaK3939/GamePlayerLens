# ゲーム採用可能性評価テンプレート

このテンプレートは、プレイヤーが対象ゲームを知り、購入し、遊び続けるまでの流れを、実データに接地して評価するためのものです。主張ごとに `knowledge/intel/` の相対リンク、Steam tool の取得値、または保存済み persona の voice 出典を付けてください。裏付けがない主張は断定せず、必ず「根拠不足」と記します。

変更相談では、以下の全セクションを「現状 vs 変更案」の差分形式で記述します。変更案だけを単独評価してはいけません。

## Overall Assessment

| 評価軸 | 現状 | 変更案 | 根拠 |
|---|---|---|---|
| Adoption Likelihood | 未評価 | 未評価 | 根拠不足 |
| Initial Friction | 未評価 | 未評価 | 根拠不足 |
| Retention Potential | 未評価 | 未評価 | 根拠不足 |
| Key Blocking Factors | 未評価 | 未評価 | 根拠不足 |

判定は「高 / 中 / 低」だけで終わらせず、どのプレイヤー行動とデータが結論を動かしたかを2〜4文で説明します。

## Who Plays and Why — Flow Analysis

プレイヤーを年齢や性別だけで区切らず、「何を期待して流入し、何で離脱し、何で戻るか」という行動 Flow で分けます。Flow ごとに次を複製してください。

### Flow: ［行動目的を表す名前］

- Volume driver: ［この Flow の人数を増減させる市場・露出・ジャンル要因］
- Friction: ［購入前、初回起動、習熟時の障害］
- Retention: ［再訪、周回、継続課金、口コミにつながる要因］
- Current size: ［大 / 中 / 小、または根拠のある数値。推測なら根拠不足］
- What we control: ［チームが直接変更できる仕様・表現・価格・運用］
- 現状 vs 変更案: ［各項目がどう動くか］
- 根拠: ［`knowledge/intel/...`、tool 取得値、persona voice 出典。なければ「根拠不足」］

## Flow Summary

| Flow | Volume driver | Friction | Retention | Current size | What we control | 現状 vs 変更案 | 根拠 |
|---|---|---|---|---|---|---|---|
| ［Flow名］ | ［要約］ | ［要約］ | ［要約］ | ［大/中/小］ | ［施策］ | ［差分］ | 根拠不足 |

優先順位は Current size だけで決めず、阻害の重大度、変更可能性、根拠の確度を併記します。

## Domain Findings

### UI

- 現状 vs 変更案: ［発見可能性、可読性、階層、操作フィードバックの差分］
- ペルソナ反応: ［persona ID と voice 出典］
- ブラインド比較: ［比較対象A/B、固定済み判定、正解開示後の解釈］
- 根拠: ［`knowledge/intel/captures/...` または `knowledge/ui-references/...`。なければ「根拠不足」］

### 価格

- 現状 vs 変更案: ［地域別価格、値引き幅、価格期待、購入タイミングの差分］
- ペルソナ反応: ［price_sensitivity と voice 出典］
- 根拠: ［`steam_fetch` / `steam_timeline` の取得値または `knowledge/intel/...`。なければ「根拠不足」］

### ローカライズ

- 現状 vs 変更案: ［対応言語、翻訳調、フォント、文化的含意、入力表示の差分］
- ペルソナ反応: ［対象言語レビュー由来の persona ID と voice 出典］
- 根拠: ［`steam_reviews` の language、recommendationId、または `knowledge/intel/...`。なければ「根拠不足」］

### 競合

- 現状 vs 変更案: ［タグ、主要ループ、レビュー評価、価格、現在の勢いに対する位置の差分］
- 模倣禁止点: ［競合の表層を移植すると対象の強みを損なう点］
- 根拠: ［`steam_search` / `steam_fetch` / `steam_timeline` / `steam_reviews` の取得値または `knowledge/intel/...`。なければ「根拠不足」］

## Change Delta

| 項目 | 現状 | 変更案 | 期待する改善 | 新しいリスク | 検証方法 | 根拠 |
|---|---|---|---|---|---|---|
| ［項目］ | ［現在値］ | ［提案値］ | ［誰のどの行動が改善するか］ | ［悪化しうるFlow］ | ［観測指標・比較手順］ | 根拠不足 |

最後に「実施 / 小規模検証 / 保留」を勧告します。根拠不足が Key Blocking Factors に関わる場合は実施を断定せず、次に取得すべきスクリーンショット、レビュー条件、価格期間、またはユーザーテストを明記します。
