# Dogfood #1 — Hades 日本市場 baseline

**Date:** 2026-08-11

**Status:** Consultation PASS / replay audit PASS / overall dogfood validation in progress

**Client-reported model:** Anthropic `claude-fable-5`

## 目的とscope

固定appid Hades `1145360`を対象に、日本市場のstorefront、price、localization、competitionをbaseline評価した。既知競合はHades II `1145350`とDead Cells `588650`。UIとgameplayは対象外とし、UI画像を取得せず、UI品質の主張も行っていない。

実行環境には`ITAD_API_KEY`と`OBSCURA_PATH`を設定していない。Steam / SteamSpyのlive dataを使い、任意integrationがない場合にmissingを0へ変換せず相談を完了できるかも検証した。

## 非公開artifact

raw artifactはgit管理外の`.game-player-lens-dogfood/`に保持し、この記録にはreview本文や第三者dataを転載しない。以下はdata homeからの相対pathである。

- Evaluation: `workspaces/hades/2026-08-11-japan-storefront-price-localization-competition-baseline.md`
- Run ID: `f52854ec-467b-4176-9882-b95f1abca9c6`
- Run: `workspaces/hades/runs/f52854ec-467b-4176-9882-b95f1abca9c6.json`

## 実行結果

| 検証項目 | 結果 |
|---|---:|
| resultHandleで保存したintel | 13 |
| resultHandle保存失敗 | 0 |
| schema検証・保存したpersona | 3 |
| simulation rounds | 9 |
| run内evidence refs | 14 |
| 保存したwarnings | 7 |
| evaluation記載の未解決evidence gaps | 4 |
| confidence / calibration | medium / not-calibrated |
| 必須artifact readback | PASS |

9 roundsはpersona 3件、選択domain 4件、harsh critic 1件、synthesis 1件で、sequence 1〜9が連続している。14 evidence refsはintel 13件と最終evaluation 1件で、run seal時に参照先とhashが記録された。

任意integrationがない経路でも、次の境界を維持した。

- ITAD価格履歴は`null`と設定手順warningになり、価格履歴0件とは解釈しなかった。
- SteamSpyのaverage playtime 0はreported zeroとして保持し、欠損相当として扱った。
- UIはN/Aのまま完了し、画像なしで視覚品質を推定しなかった。
- `language=japanese`の応答に別言語のreviewが1件含まれたため、localization evidenceから除外した。
- polarity-balanced persona素材を市場構成比やFlow Sizeへ変換しなかった。

## 相談で得たproduct finding

公開可能な要約に限ると、即時に修正候補となるのは日本語store copyに残るEarly Access期の古い案内である。日本語localizationには競合優位を示す観測signalがある一方、価格履歴、storefront visual、日本市場規模の根拠が不足した。最終勧告は断定的なgoではなく「小規模検証」となり、欠損を埋めるnext validationを3件提示した。

## 別session replay audit

先行相談の会話contextを渡さない新しいFable sessionに、read-onlyの`get_artifact`だけを許可してrunと最終evaluationを監査させた。

**Verdict: PASS**

- scope、scenario、3 personas、14 evidence、9 rounds、7 warnings、confidence境界、最終勧告、next validationを再構成できた。
- round内の全evidence referenceはrunのevidence inventoryへ解決できた。
- 壊れた、または不明な参照は0件だった。
- 「小規模検証」は、観測された強みと欠損した価格・visual・市場規模根拠の両方を反映し、保存roundから追跡可能だった。

監査の限界も残る。厳しく`get_artifact`だけに制限したためpersona JSON原本は読まず、persona identityとround出力だけを確認した。またrunに保存されたSHA-256と取得contentの独立再計算は監査client側で行っていない。これはbroken referenceではないが、汎用clientでのhash監査ergonomicsとして今後2件でも観察する。

## 今回観測したfrictionと判断

- 単一sessionでlive取得から9 rounds、保存、readbackまで行うと待ち時間が長い。所要時間はrunへ自動記録されないため、現状は定量比較できない。
- 32件のin-memory resultHandle上限は今回問題にならなかった。取得直後に保存するrecipeで13/13成功したため、実測なしに上限を増やさない。
- raw artifactをmainへ置かない保持方針が必要だったため、`.game-player-lens-dogfood/`のignoreとdata policyを追加した。
- ITADなしでも相談は完了したが、価格戦略の結論は意図どおり制限された。次の価格相談ではkeyあり経路を優先する。

## 次の検証

1. change modeで具体的な変更前後を比較し、baselineと出力が混ざらないことを実相談で確認する。
2. Game UI Database等からmanual provenance付きreferenceを用意し、1件のUI quality-gapを実行する。
3. 既知競合を与えず`steam_discover`から候補を作る別genreの相談を実行する。
4. 3件完了後、結果追跡に必要なoutcome / calibration項目とhash監査の改善要否を決める。
