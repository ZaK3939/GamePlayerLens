# ゲーム採用可能性評価テンプレート

このテンプレートは、プレイヤーが対象ゲームを知り、購入し、遊び続けるまでの流れを、実データに接地して評価するためのものです。主張ごとに Evidence ID を付け、末尾の Evidence Index で保存済み artifact へ追跡できるようにしてください。裏付けがない主張は断定せず、必ず「根拠不足」と記します。

Mode の規則を混同しないでください。`baseline` は現状だけを報告し、未提案の変更案を仮定しません。`change` だけが各評価を「現状 vs 変更案」で報告します。

Mode、Selected Domains、選択外領域の明示的な N/A 理由は、必ずレポートの最初に記録します。

- Mode: ［`baseline` | `change`］
- Selected Domains: ［`gameplay` / `storefront` / `ui` / `price` / `localization` / `competition` から選択］

| Domain | Status | 選択理由 / N/A 理由 |
|---|---|---|
| ゲームプレイ | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |
| ストア訴求 | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |
| UI | ［Selected / N/A］ | ［評価する理由、またはトピックと入力から見て対象外とする具体的理由］ |
| 価格 | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |
| ローカライズ | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |
| 競合 | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |

## Overall Assessment

使用する Mode に対応する表だけをレポートに残します。

### baseline

| 評価軸 | 現状 | 根拠 |
|---|---|---|
| Adoption Likelihood | 未評価 | 根拠不足 |
| Initial Friction | 未評価 | 根拠不足 |
| Retention Potential | 未評価 | 根拠不足 |
| Key Blocking Factors | 未評価 | 根拠不足 |

### change

| 評価軸 | 現状 | 変更案 | 根拠 |
|---|---|---|---|
| Adoption Likelihood | 未評価 | 未評価 | 根拠不足 |
| Initial Friction | 未評価 | 未評価 | 根拠不足 |
| Retention Potential | 未評価 | 未評価 | 根拠不足 |
| Key Blocking Factors | 未評価 | 未評価 | 根拠不足 |

判定は「高 / 中 / 低」だけで終わらせず、どのプレイヤー行動とデータが結論を動かしたかを2〜4文で説明します。

## Who Plays and Why — Flow Analysis

プレイヤーを年齢や性別だけで区切らず、「何を期待して流入し、何で離脱し、何で戻るか」という行動 Flow で分けます。Flow ごとに次を複製してください。

Flow Size は、`steam_fetch` の母集団 `reviewStats`、SteamSpy `owners` の推定であることへの caveat、および市場規模・需要を示す外部根拠を併記した場合だけ大小を判定できます。SteamSpy `owners` は所有数の推定範囲であり、売上本数ではないため、単独で Flow Size を確定しません。

polarity-balanced persona sample（balanced sample）は問題発見用であり、市場母集団の比率ではないため、Flow Size や Adoption Likelihood の比率に変換してはいけません。

### Flow: ［行動目的を表す名前］

- Volume driver: ［この Flow の人数を増減させる市場・露出・ジャンル要因］
- Friction: ［購入前、初回起動、習熟時の障害］
- Retention: ［再訪、周回、継続課金、口コミにつながる要因］
- Current size: ［大 / 中 / 小、または根拠のある数値。推測なら根拠不足］
- Flow Size basis: ［`reviewStats`、`owners` 推定 caveat、外部根拠。欠ける場合は「根拠不足」］
- What we control: ［チームが直接変更できる仕様・表現・価格・運用］
- Mode result: ［baseline は現状だけ、change は現状 vs 変更案］
- 根拠: ［Evidence ID。なければ「根拠不足」］

## Flow Summary

| Flow | Volume driver | Friction | Retention | Current size | Flow Size basis | What we control | Mode result | 根拠 |
|---|---|---|---|---|---|---|---|---|
| ［Flow名］ | ［要約］ | ［要約］ | ［要約］ | ［大/中/小］ | ［reviewStats / owners caveat / 外部根拠］ | ［施策］ | ［現状だけ / 現状 vs 変更案］ | 根拠不足 |

優先順位は Current size だけで決めず、阻害の重大度、変更可能性、根拠の確度を併記します。

## Domain Findings

以下の各項目は、`baseline` では現状だけ、`change` では現状 vs 変更案を記入します。Selected Domains の選択外なら、所見を作らず、冒頭と同じ明示的な N/A 理由だけを記録します。

### ゲームプレイ

- Status: ［Selected / N/A と理由］
- Mode result: ［プレイヤーから観測できるコアループ、目標、入力→反応、進行、失敗→再挑戦、継続動機 / change の場合は現状 vs 変更案］
- 観測とproxyの境界: ［仕様・build・動画・telemetry・playtestによる直接根拠 / description・categories・tags・reviewsによるプレイヤー知覚のproxy］
- 未検証の内部ロジック: ［コード、状態遷移、数式、難易度曲線など、直接根拠がなく断定できないもの］
- ペルソナ反応: ［gameplay / difficulty / grind / replayability等のvoice出典］
- 根拠: ［`steam_fetch` / `steam_reviews` / 提供仕様・build・playtestの Evidence ID。なければ「根拠不足」］

### ストア訴求

- Status: ［Selected / N/A と理由］
- Mode result: ［短文・詳細説明の価値提案、想定プレイヤー、独自性、CTA、スクリーンショットとの整合、期待と実プレイ評価の差 / change の場合は現状 vs 変更案］
- Copy比較: ［`localizedStorefronts`のenglish / japanese / german。requested localeとSteam fallbackの可能性を明記］
- Visual比較: ［対象と競合のstore page、Steam Sonar game dashboard、capsule / screenshots。未取得なら「根拠不足」］
- ペルソナ反応: ［購入前期待、価値、誤解に関するvoice出典］
- 根拠: ［`steam_fetch` / `ui_capture` / `steam_reviews` の Evidence ID。なければ「根拠不足」］

### UI

- Status: ［Selected / N/A と理由］
- Mode result: ［現状の発見可能性、可読性、階層、操作フィードバック / change の場合は現状 vs 変更案］
- ペルソナ反応: ［persona ID と voice 出典］
- ブラインド比較: ［qualityTier と同等の出荷済み製品、固定済み判定、正解開示後の解釈］
- 根拠: ［Evidence ID。なければ「根拠不足」］

### 価格

- Status: ［Selected / N/A と理由］
- Mode result: ［現状の地域別価格、値引き幅、価格期待、購入タイミング / change の場合は現状 vs 変更案］
- ペルソナ反応: ［price_sensitivity と voice 出典］
- 根拠: ［`steam_fetch` / `steam_timeline` の Evidence ID。なければ「根拠不足」］

### ローカライズ

- Status: ［Selected / N/A と理由］
- Mode result: ［現状の対応言語、翻訳調、フォント、文化的含意、入力表示 / change の場合は現状 vs 変更案］
- Store copy: ［`localizedStorefronts`のrequested locale / fallback注意。対応言語一覧だけで翻訳品質を判定しない］
- ペルソナ反応: ［対象言語レビュー由来の persona ID と voice 出典］
- 根拠: ［`steam_reviews` の language、recommendationId を含む Evidence ID。なければ「根拠不足」］

### 競合

- Status: ［Selected / N/A と理由］
- Mode result: ［現状のタグ、主要ループ、レビュー評価、価格、現在の勢い / change の場合は現状 vs 変更案］
- 模倣禁止点: ［競合の表層を移植すると対象の強みを損なう点］
- 根拠: ［`steam_search` / `steam_fetch` / `steam_timeline` / `steam_reviews` の Evidence ID。なければ「根拠不足」］

## Change Delta

`change` のみ記入します。`baseline` では本セクションを出力せず、変更案の比較を行いません。

| 項目 | 現状 | 変更案 | 期待する改善 | 新しいリスク | 検証方法 | 根拠 |
|---|---|---|---|---|---|---|
| ［項目］ | ［現在値］ | ［提案値］ | ［誰のどの行動が改善するか］ | ［悪化しうるFlow］ | ［観測指標・比較手順］ | ［Evidence ID / 根拠不足］ |

## Data Semantics

各数値に次の status を付け、互いに置き換えません。

- `reported-zero`: source が明示的に 0 を返した値。ただし SteamSpy `average_forever=0` のように仕様上、欠損相当と扱う場合は、原値と解釈を両方記録する。
- `missing`: source が値を返さなかった、または取得できなかった状態。0 で補完しない。
- `estimated`: 推定値。推定主体、方法、範囲、caveat を併記する。SteamSpy `owners` は所有数の推定であり、売上本数ではない。

## Evidence Index

事実主張に使ったすべての保存済み根拠を1行ずつ記録します。`artifact repository-relative path` は repository root からの相対 path とし、絶対 path は書きません。`observedAt` は根拠の観測時刻、`source` は tool 名または外部 provider とします。

| Evidence ID | artifact repository-relative path | observedAt | source | Data status / warning |
|---|---|---|---|---|
| E-001 | `knowledge/intel/<target>/<artifact>.json` | ［ISO 8601］ | ［tool / provider］ | ［reported-zero / missing / estimated / observed、warning］ |

## Final Recommendation

- Recommendation: ［実施 / 小規模検証 / 保留］
- Rationale: ［判断を動かした Flow、阻害、Evidence ID］
- confidence: ［高 / 中 / 低、およびその理由］
- next validation: ［次に検証する仮説、対象、手順、成功指標］
- Unresolved evidence gaps: ［根拠不足と必要な取得条件］

根拠不足が Key Blocking Factors に関わる場合は実施を断定せず、next validation に次に取得すべきスクリーンショット、レビュー条件、価格期間、またはユーザーテストを具体化します。
