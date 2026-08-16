# UI 品質差 rubric

目的は、対象UIを有名作品へ似せることではなく、同じplayer taskを実行するときの製品品質差を、比較可能な証拠と軸別gapで特定することです。人気、売上、ブランド知名度、制作規模はUI品質の代理値にしません。

## 1. Benchmark task と cohort ゲート

- 比較前に `uiBenchmarkTask` を、playerの目的、開始状態、完了状態を含む1文で固定する。例: 「controllerでinventoryを開き、武器性能を比較して装備する」。単なる「inventory画面」「HUD」のような名詞だけでは差し戻す。
- 対象とreferenceは、同じscreen typeまたはflow、platform、control method、近い情報量で揃える。viewportとaspect ratioの差は記録し、比較へ与える影響を説明する。
- reference cohortは、指定された `qualityTier` と同等の出荷済み製品を2〜4本使う。1本だけ、または著名さだけで選んだcohortは差し戻す。
- Game UI Databaseではscreen type、controls、HUD elements、layout、texture、patterns、colorを候補探索に使う。font size、icon usage、colorblind visualizer、videoが確認できる場合は対応する評価軸へ使う。Interface In Gameなど同種catalogを補助sourceにしてよい。
- catalogの掲載、like数、人気順は品質証明ではない。候補を見つけるためだけに使い、実際に保存したscreenまたはvideo evidenceを評価する。
- Game UI Databaseの公開APIを仮定せず、robots、利用条件、認証、download制限を回避しない。bulk scrapingを行わず、ユーザーが指定したURL、通常のpage capture、または権利上利用可能な手動referenceだけを使う。

## 2. Provenance ゲート

各referenceは画像とは別に、`save_intel`（sourceTool=`manual`） で次を保存する。不明項目は創作せず `unknown` とする。

top-level `observedAt` は権威ある取得時刻を保持している場合だけ渡す。不明なら推測せず省略し、サーバーが `savedAt` と同じ時刻を設定する。

- source site とHTTPS page URL
- accessedAt
- game title
- screen type と具体的なscreen / flow state
- platform、control method、aspect ratio
- static image または video / interactive observation
- 対応するcaptureまたはui-reference ID
- cohortへ選んだ理由と既知のmismatch

page URLだけ、catalog検索結果だけ、未保存画像だけをEvidenceにしてはいけない。copyrightまたは利用条件が不明で画像を保存できない場合は、URLをprovenanceとして残しつつ画像評価を「根拠不足」とする。

## 3. Blind comparison ゲート

- referenceのgame名、logo、file名、source metadataを評価者から隠し、対象を含む全画像をopaque aliasへ無作為割当する。
- pre-revealではaliasだけで採点し、具体的な画面位置、観測、改善候補を固定する。reference provenanceは固定後に開示する。
- 同じmodelがreferenceを探索してgame名や対応表を見た後、記憶を隔離せず評価も行う場合はblind条件を満たさない。比較は続けられるが `non-blind structured comparison` と明記し、blind comparisonと呼ばずconfidenceをhighにしない。
- crop、scale、圧縮、明度調整が一方だけ有利にならないよう条件を揃える。揃えられない差はlimitationとして残す。
- catalog一覧や複数screenが同時に見えるpage captureを、単一screenのblind evidenceに使わない。selected single-screen viewerをcaptureするか、権利上利用可能な画像を同条件で手動準備する。
- screenshotから遷移、latency、controller feel、hover/focus/loading/errorの未表示stateを推測しない。これらはvideo、連続capture、または実操作の直接証拠がある場合だけ採点する。

## 4. 軸別 scoring

各軸を0〜4の整数で採点する。`0=taskを阻害または必要情報なし`、`1=material deficit`、`2=出荷可能だが明確な摩擦あり`、`3=cohort標準`、`4=cohortを上回る明確な強み`。直接証拠がない軸は0にせず `unscored` とする。

1. Task clarity / 主要行動と次の一手
2. Information hierarchy / glanceability / 視線移動
3. Density / typography / localization-safe legibility
4. Input mapping / focus visibility / action affordance
5. State visibility / feedback / error prevention and recovery
6. Accessibility / color independence / contrast / readable scale
7. Component and visual-system consistency / production finish
8. Flow and motion continuity / interruption cost

画面の美観だけを総合点にしない。特に軸4、5、8はstatic screenshotだけなら、見えている要素に限定するか `unscored` にする。

## 5. Gap の計算と解釈

- 軸ごとにreference cohortの中央値を求め、`gap = target score - reference median` とする。未採点値を0として計算に入れない。
- `gap <= -1`: material deficit、`-1 < gap < 0`: watch、`gap = 0`: cohort parity、`gap > 0`: demonstrated strength。
- ordinal scoreの小数差を精密な性能測定として扱わない。gapは修正優先順位を決める比較指標であり、conversion、retention、売上の因果効果を表さない。
- Overall UI gapは単純平均だけで決めず、benchmark taskの完了を阻害する軸、対象personaのdealbreaker、証拠confidenceを優先する。
- referenceを変えるとgapも変わる。cohort、qualityTier、screen state、採点不能軸を必ず併記する。

## 6. 必須出力

| Axis | Target | Reference median | Gap | Evidence IDs | Observation / location | Confidence |
|---|---:|---:|---:|---|---|---|
| Task clarity | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［差 / N/A］ | ［ID］ | ［画面位置と観測］ | ［high / medium / low］ |

表の後に次を記録する。

- material deficits: targetが負け、benchmark taskを阻害する軸
- demonstrated strengths: targetが勝ち、変更で失ってはいけない軸
- recommended changes: ブランド表現のコピーではなく、gapを閉じる再利用可能な原則
- validation plan: 同じtask、platform、controlsでの再capture、操作test、成功指標
- limitations: static-only、cohort mismatch、匿名化不能、missing state、利用条件による未取得
