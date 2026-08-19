# Evidence coverage rubric

目的は、取得件数を増やすことではなく、意思決定に必要な問いを先に固定し、直接観測、推定、欠損を混ぜずにデータの穴を可視化することです。artifact数やround数だけを分析品質とみなしません。

## 1. Status と2つのcoverage指標

Selected Domainの各必須dimensionへ、`observed`、`reported-zero`、`estimated`、`missing`、`N/A`のいずれかを付けます。

- `observed`: sourceが観測範囲と時点を持つ実値、保存済み仕様、build/video/playtestの直接観測。
- `reported-zero`: sourceが明示した0。0を欠損へ変えず、source固有の解釈を併記する。
- `estimated`: 推定主体、方法、範囲、caveatを保存した推定。直接観測とは数えない。
- `missing`: 必要だが未取得、取得失敗、または主張に使えない不一致データ。0で補完しない。
- `N/A`: Selected Domain内でも相談対象に原理的に適用しないdimension。具体的なscope理由が必須で、単なる取得失敗をN/Aにしない。

分母からN/Aだけを除き、次をdomain別と全体で計算します。

- `Coverage rate = (observed + reported-zero + estimated) / applicable dimensions`
- `Direct observation rate = (observed + reported-zero) / applicable dimensions`

両方のrateは小数1桁の%表記に丸めます。Selected Domainの全dimensionをN/Aにはできません。該当dimensionが1つもないなら、そのdomainをSelected Domainsから外します。

小数はデータ充足のinventoryであり、結論の正しさや成功確率ではありません。blocking dimensionがmissingなら、平均coverageが高くてもconfidenceをhighにしません。

## 2. Domain別の必須dimension

### gameplay

1. player-facing core loop: 目標、主要行動、feedbackを仕様、build、video、playtestのいずれかで確認。操作可能なbuildではAction → responseの時系列logを優先する。
2. progression and reward: 短期・長期の進行と報酬を直接資料で確認。indie survival topicでは`rewardMechanisms`のbefore state → player action → system response → after state / perceived rewardへ対応付ける。
3. failure and retry: 失敗条件、再挑戦、摩擦を直接資料またはplaytestで確認。
4. player response: reviews、playtest、surveyのいずれかで期待と実感を確認。

Steam description、tags、categoriesだけの場合はplayer perceptionのproxyであり、1〜3をobservedにしません。AI 1 testerのtest playは操作摩擦の直接観測ですが、人間のfunやretentionの代表ではありません。

### storefront

1. copy and metadata: short description、about、features、languagesをlocale別に保存。
2. visual promise: capsule、screenshots、trailerまたは許可済みcaptureを保存。
3. expectation match: copy/visualが作る期待とreviewsまたはplaytestの実感をPromise-Delivery Traceで対応付ける。
4. competitor context: 同じgenreだけでなく、同じ購入理由を持つ比較候補の同種証拠を確認。

### ui

1. target task state: player task、開始状態、完了状態に対応する対象画像またはvideo。
2. matched cohort: 同じtask、platform、controls、近い情報量の出荷済みreferenceを2〜4本。
3. provenance: 各画像と分離したsource URL、accessedAt、screen state、capture ID、mismatch。
4. interaction flow: focus、input、transition、error/recovery、motionをvideo、連続capture、実操作のいずれかで確認。static-onlyならmissingであり0点にしない。
5. localization and accessibility state: 対象言語の長文、contrast、color independence、readable scaleを該当stateで確認。

### price

1. current regional price: 少なくともJP、US、DEの通貨・通常価格・現在割引を同じ観測時点で確認。
2. price history: 対象期間、通常価格変更、割引履歴、底値をITAD等の履歴sourceで確認。key未設定はmissing。
3. player price response: 対象市場reviews、survey、wishlist/playtest feedbackのいずれかで価格摩擦を確認。
4. competitor price context: 比較候補のedition、通貨、discount stateを揃える。

priceを選択したreviewは、4 dimensionのcoverageとは別に`Pricing Decision Trace`を作ります。`primary objective`をnet revenue、paid reach、qualified feedback、positioning等から1つ固定し、他の目的はguardrailへ置きます。現在案と変更案について`base price`、package / edition、地域、`launch discount`の有無・率・期間、割引後も維持する価格、value / quality signal仮説を分離します。matched competitorと対象player responseを根拠にし、`success signal`、観測window、`guardrail`、revisit conditionを明記します。

「安いほど販売本数が増える」「高いほど品質が高く見える」「launch discountがお得感を作る」はいずれも検証対象の仮説であり、普遍則ではありません。developer comment、単一事例、wishlist、review件数だけで購入率やnet revenueを断定しません。Steamで実施する案は公式の現行pricing / discount rulesとminimum thresholdをaccessedAt付きで確認し、実行不能な案を推奨しません。

### localization

1. localized storefront: requested localeのcopyを保存し、fallback可能性を残す。
2. target-language player response: 実際のlanguageを検査したreviewsまたはplaytest。
3. in-game rendering: 対象言語のfont、wrap、truncation、input glyphを該当画面で確認。
4. semantic quality: 文脈、用語一貫性、toneをnative reviewまたは権威ある校閲で確認。対応言語一覧だけではobservedにしない。

### competition

1. candidate discovery: tag/genre交差、既知競合、player needなど候補生成軸を保存。
2. candidate validation: `competitor-selection.md`に従い3〜8本を個別fetchし、Fit roleとMarket role、freshness、loop / purchase reason、包含・除外理由をCompetitor Selection Ledgerへ記録。
3. current market signal: 観測時点のreviewStats、CCU、owners推定等をsource semantics付きで確認。
4. historical context: 価格または勢いの履歴を確認。現在値からtrendを作らない。

## 3. Integrity と独立性ゲート

- toolの`resultHandle`がある取得結果はexact saveし、モデルによる再serializeを禁止する。
- manual evidenceはsource、取得条件、observedAtの信頼境界を記録する。時刻不明ならtop-level observedAtを省略する。
- changeでは各`scenario × Selected Domain`と各`persona × scenario`を別roundで評価する。
- 最終evaluationはsynthesis後に作るため、どのroundのevidenceRefsにも使わない。使った場合は循環参照として差し戻す。
- run保存後に`get_artifact(kind=run)`でreadbackし、`integrity.status=verified`を完了条件にする。`failed`はrecordまたは依存artifactのmissing/mismatch/unreadableを修正する。sealまたはcoverageを欠くrecordは現行runとして受理しない。
- canonical sealは偶発的な編集とdependency driftのchecksumであり、署名や外部attestationではない。data rootへの書込権限を持つ攻撃者への真正性保証と表現しない。

## 4. Confidence と勧告

- blocking dimensionがmissingならconfidenceをhighにしない。勧告は「小規模検証」または「保留」とし、欠損を埋める手順と成功指標を出す。
- estimatedだけで満たしたdimensionはCoverage rateには入るがDirect observation rateには入らない。推定だけから因果効果や市場規模を断定しない。
- Coverage rate 100%でもsourceが単一、cohort不一致、古い観測、非代表sampleならconfidenceを下げる。
- 取得件数を増やしても同じsource biasしか増えない場合は停止し、別source、実操作、playtest、telemetryへ切り替える。

## 5. 必須出力

| Domain | Dimension | Status | Evidence IDs | Limitation / mismatch | Decision impact |
|---|---|---|---|---|---|
| ［domain］ | ［固定dimension］ | ［observed / reported-zero / estimated / missing / N/A］ | ［ID / なし］ | ［観測範囲・不一致］ | ［confidence・勧告への影響］ |

表の後にdomain別と全体のCoverage rate、Direct observation rate、blocking missing dimensions、次に取得する最小データを記録します。
