# Dogfood data policy

実相談のraw artifactは、repository rootの `.game-player-lens-dogfood/` を `GAME_PLAYER_LENS_HOME` に指定して保存します。このdirectoryはgit管理しません。

## なぜmainへ入れないか

- Steam review本文、第三者サイトのcapture、相談対象の仕様など、公開・再配布条件が異なるdataを含みうる。
- run ledgerはpersona、evidence、recipeのhashと全round出力を持ち、公開repositoryへ置く前に内容確認が必要。
- fixtureと実観測dataを混ぜると、決定的テストとlive検証の境界が崩れる。

## 完了した実相談の保持条件

各相談は同じtargetのdata homeに、少なくとも次を残します。

- `knowledge/intel/<target>/`: 使用した外部tool出力原本とmanual provenance
- `knowledge/personas/`: 使用したpersona JSON
- `workspaces/<target>/<date>-<topic>.md`: 最終evaluation
- `workspaces/<target>/runs/<run-id>.json`: immutable run ledger

相談終了時に、evaluation path、run ID、run path、warning数、根拠不足の件数、resultHandle保存失敗数をdogfood記録へ残します。raw artifactを削除する場合は、削除理由と保持した集計だけを記録します。

## 公開例への昇格

READMEや`docs/examples/`へ昇格できるのは、次を満たすsanitized成果物だけです。

- secret、個人情報、非公開仕様を含まない。
- review本文、画像、第三者dataの再配布条件を確認した。
- raw absolute pathを含まない。
- observed / reported-zero / missing / estimated、warning、confidence、calibration境界を削らない。
- 実相談の結論を都合よく書き換えず、必要なら抜粋であることを明記する。

## Validation status

設計とテストが完了していても、保存された実相談がなければ `Implemented, not dogfood-validated` と扱います。最低3件の実相談、1件のUI quality-gap、1件の別session replay auditが揃った時点で、dogfood validation完了を判断します。

現在は `Dogfood validation in progress` です。

| 条件 | 進捗 | 記録 |
|---|---:|---|
| 保存済み実相談 | 1 / 3 | [Hades 日本市場 baseline](2026-08-11-hades-japan-baseline.md) |
| 別session replay audit | 1 / 1 | PASS（同記録内） |
| UI quality-gap | 0 / 1 | 未実施 |

件数だけで完了にはしません。残りの相談ではchange比較、未知競合のdiscovery、UI referenceを使った実力差評価をそれぞれ実際に通し、同じ結論を繰り返すだけの検証を避けます。
