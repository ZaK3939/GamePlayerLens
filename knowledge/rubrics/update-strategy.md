# Update strategy rubric

目的は、既存ゲームと競合の更新履歴、現在のプレイヤー問題、personaの反応を結び、次のゲーム更新を小さく検証可能な単位へ落とすことです。更新回数や有名ゲームの施策を、そのまま品質・売上効果・正解の証明にはしません。

## 1. 根拠の階層

- 公式更新履歴: `steam_updates`のofficial feed、`publishedAt`、title、content、tag。`patchnotes` tagによるupdate選定はSteam由来、title選定とtypeはheuristicです。`updateEvidence` / `updateConfidence`と`typeConfidence`を分け、本文中の単語だけではupdateとして選定しません。
- プレイヤー問題: recommendation ID付きreview、persona v2の`observed_patterns`、playtest、support ticket、telemetry。タグやストア説明だけで問題の発生を断定しません。
- 更新結果: update前後で固定した指標、cohort、期間、build、比較条件。更新履歴とレビューが時系列で近いだけでは因果根拠になりません。
- 競合precedent: 実装可能性や運営パターンの参考であり、自作品で同じ効果が出る証明ではありません。

`steam_updates.summary.medianIntervalDays`は取得できたupdate-like項目間隔の中央値です。開発速度、品質、放置判定、適正cadenceを単独では示しません。取得件数、`before`、scope、underfilled warningを必ず併記します。

## 2. Update inventory

対象と比較ゲームごとに次を記録します。

| Game / appid | Window / scope | Tagged patch notes | Inferred updates | Type mix | Median interval | Latest | Warning / limitation | Evidence ID |
|---|---|---:|---:|---|---:|---|---|---|
| ［game］ | ［latest / before / updates or official］ | ［件数］ | ［件数］ | ［major/content/balance/fixes/...］ | ［days / N/A］ | ［ISO］ | ［分類・取得範囲］ | ［ID］ |

`official` scopeのevent、sale、community announcementと、`updates` scopeのupdate-like項目を混同しません。内容が空、titleだけ、tagなしの場合はthemeのconfidenceを下げます。`platformHints`にSwitch、mobile、Mac、Steam Deck等がある項目は対象platformを確認し、Steam build更新だと自動的に扱いません。

## 3. Issue → update → signal trace

提案ごとに一本の追跡線を作ります。

| Player problem | Affected persona / Flow | Current evidence | Update slice | Precedent | Expected response | Status | Validation / guardrail |
|---|---|---|---|---|---|---|---|
| ［問題］ | ［persona ID］ | ［review/playtest/telemetry ID］ | ［最小変更］ | ［update Evidence ID / なし］ | ［行動仮説］ | ［observed / inferred / unknown］ | ［指標・期間・悪化停止条件］ |

- 問題根拠がmissingなら、実装を勧告せず`investigate`にする。
- precedentだけがあり対象ゲームの問題根拠がなければ`defer`にする。
- personaの`update_reaction`は、直接review根拠があればobserved、dealbreaker等からの推論ならinferred、どちらもなければunknownとする。
- 「プレイヤーが喜ぶ」「retentionが上がる」ではなく、誰が何を再評価・完了・継続するかを仮説として書く。

## 4. Priority and release decision

優先順位は擬似的な精密scoreにせず、次を別々に記録します。

- severity: blocker / material / minor
- evidence confidence: high / medium / low
- affected scope: 観測できたcohort / 不明。persona件数を市場比率にしない
- reversibility: easy / moderate / hard
- validation cost: small / medium / large
- dependency / regression risk

Decisionは`fix-now / test-next-build / investigate / defer`のいずれかにします。`fix-now`は再現可能なblocker、直接根拠、安全な変更範囲、guardrailが揃う場合だけです。

## 5. Required result

- Decision Card: decision、player problem、affected persona、smallest update、confidence、success signal、guardrail、revisit condition
- Update inventory: 対象と競合の取得window・分類境界
- Persona Update Impact Matrix: personaごとのadoption / retention / churn / update reaction
- Prioritized Update Backlog: 1〜5件。各項目にEvidence ID、status、validationを付ける
- Unknowns: telemetry、人間playtest、過去build、対象言語など不足条件

## 6. 禁止する結論

- 更新頻度が高いから品質、売上、retentionが高い
- 長期間patch noteがないから放置されている
- 競合が実施したから自作品でも実施すべき
- update前後のreview変化だけで、そのupdateが原因だと断定する
- polarity-balanced persona数をaffected player shareへ変換する
