# Dogfood #2 — Hades 日本語store copy change

**Date:** 2026-08-11

**Status:** Consultation PASS / mode separation PASS / overall dogfood validation in progress

**Client-reported model:** Anthropic `claude-fable-5`

## 目的とscope

Dogfood #1で観測した日本語Steam store copyの陳腐化を、実際の変更案として評価した。modeは`change`、Selected Domainsは`storefront`と`localization`。UI、gameplay、price、competitionは、copyだけを変更するためN/Aとした。

比較したscenarioは次の2件である。

- `jp-copy-current`: 保存済み観測時点の日本語about-the-game copy。
- `jp-copy-refresh-spec`: Early Access、work-in-progress、playtest、defect-report案内を削除し、冒頭約150字を出荷済み製品のcore promiseへ整理する仕様。price、screenshots、capsule、languages、gameplay、featuresは変更しない。

新しいlive取得は行わず、Dogfood #1で保存した2026-08-11のintelと3 personasを再利用した。これにより、artifact重複なしで過去相談から次の意思決定へ進めるかを検証した。

## 非公開artifact

raw artifactはgit管理外の`.game-player-lens-dogfood/`に保持する。この記録にはreview本文を転載しない。

- Evaluation: `workspaces/hades/2026-08-11-jp-store-copy-production-refresh.md`
- Run ID: `211b7513-4806-4b6f-823c-2dd98bf1a116`
- Run: `workspaces/hades/runs/211b7513-4806-4b6f-823c-2dd98bf1a116.json`

## 実行結果

| 検証項目 | 結果 |
|---|---:|
| scenarios | 2 |
| simulation rounds | 12 |
| 再利用したintel evidence | 4 |
| run内evidence refs | 5 |
| 保存したwarnings | 5 |
| broken references | 0 |
| mode separation | PASS |
| confidence / calibration | medium / not-calibrated |
| evaluation / run readback | PASS |

12 roundsは、3 personas × 2 scenariosの6件、2 domains × 2 scenariosの4件、harsh critic 1件、synthesis 1件で、sequence 1〜12が連続している。personaとdomainのcurrent/proposed出力を別roundにし、変更案だけの単独評価を避けた。prior baseline evaluationは履歴として読んだが、新しい事実主張のevidenceには使っていない。

## 結論

最終勧告は条件付きの「実施」となった。

- 新しい冒頭は公開前にnative Japanese proofreadを通す。
- 公開後にJP storefrontを再取得し、陳腐化文言の除去、4つのcore promise、非変更fieldを確認する。
- conversion、retention、売上への影響量は測定不能であり、改善効果として約束しない。
- price不変のため、価格を優先するpersonaの購入行動は変わらないと評価した。

変更案の4つの訴求は保存済みofficial storefrontで裏付けられる範囲に限定した。新機能や未観測の品質を追加せず、観測済みのcopy管理欠陥だけを修正対象にした。

## Warningとevidence境界

- live再取得なし。結論は保存artifactのobservedAt時点に限定する。
- proposalは未出荷仕様であり、公開後の実ページ状態と成果は未観測。
- UI画像を取得していないため、capsuleやscreenshotsの視覚品質を推定していない。
- Steamの`language=japanese`応答に含まれた別言語review 1件はlocalization evidenceから除外した。
- `matchesEnglishCopy=false`を翻訳品質やfallback理由の証明として扱っていない。

## 今回観測したfrictionと判断

- 1 roundが1 scenarioだけを持つため、change modeではpersonaとdomain passがscenario数に比例して増える。今回は12 roundsでも2 MiB上限内に十分収まったため、直ちにschemaを広げず3件目まで観察する。
- evaluationを先に保存し、そのIDを含めてrunを封印する順序は成功したが、client recipeで守る必要がある。
- 保存済みintelとpersonaをそのまま再利用でき、payload再serializeも重複保存も発生しなかった。

## 次の検証

1. Game UI Database等のmanual provenance付きreferenceとSteam画像を使い、UI quality-gapを実行する。
2. 同じbenchmark taskとscreen stateで2〜4本を揃え、static画像からmotionやlatencyを断定しないことを確認する。
3. 3件目完了後、roundのscenario表現とhash監査ergonomicsを実測結果から判断する。
