# Competitor Selection rubric

目的は「有名なゲームを並べる」ことではなく、対象ゲームが同じ購入理由で比較される相手、市場で成立した近年のパターン、長期的な上限、反証用の対照例を分けて選ぶことです。単一の総合点で順位付けせず、`Fit role`、`Market role`、freshness、根拠確度を別々に保存します。

## 1. 対象ゲームから比較軸を固定する

候補を探す前に、対象の説明、実build、project brief、playtest、store copyから最低3つのmust-match axisを固定します。例は入力方式、反復行動、戦闘構造、run構造、プレイヤーが購入する理由です。tag一致は候補生成に使えますが、主要loopや購入理由の一致を証明しません。

提供codebaseを調べられる場合、[code-review-graph](https://github.com/tirth8205/code-review-graph)のようなlocal structural graphは、entry point、依存関係、blast radius、test接続を見つける候補生成の補助にできます。graph edgeやdead-code判定を事実の最終根拠にせず、該当source、test、runtime観測で確認します。code graphは市場の競合、売上、評価、プレイヤー知覚を証明しません。

## 2. Fit roleとMarket roleを分離する

各候補にFit roleを1つだけ付けます。

- `direct-competitor`: must-match axisの中心が重なり、同じ購入判断で比較される。
- `adjacent-competitor`: 購入理由または主要loopの一部が重なるが、形式・対象player・進行に重要な差がある。
- `system-reference`: mechanicやreward loopだけを学ぶ。市場の直接競合として数えない。
- `visual-reference`: UI、画面状態、art directionだけを比較する。gameplay fitとして数えない。
- `rejected-candidate`: 有名、tag一致、見た目類似などの入口はあるが、検証後に除外する。

さらにMarket roleを1つだけ付けます。

- `recent-success`: 宣言したfreshness window内で、reviewとscale / momentumの両方に根拠がある。
- `breakout-anchor`: freshness外でも、同じ購入理由や仕組みに市場上限を示す強い履歴がある。
- `comparison-control`: 高評価だが小sample、巨大だが低fit、失速例など、成功作だけを見るbiasを抑える。
- `unproven`: fitはあるが、市場signalが小さい、未成熟、またはdemo段階。
- `not-assessed`: 市場データを判断に使っていない。

`direct-competitor = recent-success`とは限りません。新しい直接競合が小規模でもfitの根拠になり、巨大ヒットが低fitならbreakout anchorまたはreferenceに留まります。

## 3. 成功signalを一つに潰さない

高評価率だけで成功の十分条件ではない。母数が小さい100% positiveと、大きなsampleで高評価を維持する作品を同じ強さにしません。`recent-success`または`breakout-anchor`には、同じ観測時点の次の2列を必須にします。

1. `Review signal`: review件数、positive率、対象language / recent / lifetimeの範囲。
2. `Scale / momentum signal`: CCU、recent review activity、owners推定、wishlist等の取得可能な独立signal。各source semanticsとwarningを残す。

SteamSpy ownersは推定所有数であり販売本数ではありません。現在CCU、現在review件数、owners推定から過去の成長率や将来売上を作りません。demo、early access、released、upcomingを混ぜず、release stageを明示します。

## 4. 新しさを明示的に扱う

評価日を基準に`Competitor freshness window`を宣言します。既定の検討入口は直近24か月ですが、genreのrelease cycleが短い場合は狭め、供給が少ない場合は広げた理由を記録します。

- `current-window`: release dateがfreshness window内で、評価日より未来ではない。
- `historical`: windowより前。
- `upcoming`: 未発売または評価日より後の予定日。市場成功の証拠にはしない。
- `unknown`: release dateを確認できない。

`recent-success`は必ず`current-window`です。古い大ヒットは`breakout-anchor`として残せますが、現在の競争密度、価格期待、visual barの代表にはしません。

## 5. 候補経路と最小cohort

少なくとも2つの独立したcandidate routeを使います。canonical routeは`known-name`、`steam-discover`、`steam-sonar`、`store-copy`、`review-mention`です。候補が見つからない場合も条件を黙って変えず、緩めたaxisと結果を記録します。

Competitor Selection Ledgerは3〜8件とし、最低限次を含めます。

- includeされた`direct-competitor`または`adjacent-competitor`を1件以上。
- includeされた`recent-success`または`breakout-anchor`を1件以上。
- `comparison-control`または`rejected-candidate`を1件以上。

全候補を`steam_fetch`で個別確認し、市場判断に使う候補へ`steam_timeline`、必要に応じて`steam_reviews`を使います。Steam Sonar、SteamDB、storeのlinkは入口であり、リンク先を保存・観測していなければEvidenceにしません。各行は保存済みEvidence IDへ接続し、include / exclude理由をcore loopまたはpurchase reasonの観測可能な差で書きます。

## 6. 出力契約

`competition`選択時はDomain Findingsに次を置きます。

- `Competitor freshness window: <1-60> months from YYYY-MM-DD`
- `Competitor must-match axes`: semicolon区切りで3件以上。
- `Competitor candidate routes`: canonical routeをsemicolon区切りで2件以上。
- canonical `Competitor Selection Ledger`。

Fit role、Market role、Review signal、Scale / momentum signalを一つのscoreへ統合しません。選定結果は「似ている」「売れている」「新しい」「根拠が強い」のどれが判断を動かしたかを分離したまま、Mechanism Transfer Map、persona source role、UI reference cohortへ渡します。
