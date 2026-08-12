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

## Decision Card

長文所見の前に、現時点の意思決定を1画面で固定します。根拠不足なら無理に`fix-now`を選ばず、`investigate`または`defer`にします。

- Decision: ［`fix-now` / `test-next-build` / `investigate` / `defer`］
- Player problem: ［誰が、どの状態で、何に阻害されるか］
- Affected persona / Flow: ［persona ID。市場構成比ではない］
- Smallest next update: ［独立して検証できる最小変更。baselineで変更を提案しない場合はN/A］
- Evidence status: ［observed / inferred / unknown とEvidence ID］
- Confidence: ［high / medium / low とblocking missing］
- Success signal: ［build、cohort、期間、行動指標］
- Guardrail / rollback: ［悪化を止める指標と戻せる単位］
- Revisit condition: ［何が取得・発生したら判断を更新するか］

## Indie Survival Strategy

concept、prototype、vertical slice、store公開、demo、Next Fest、launch、post-launch、studio survivalを扱う場合は`indie-survival-strategy.md`に従います。通常のreview取得や価格照会だけなら、`適用外: ［N/A理由］`と記録します。

### Indie Strategy Card

- Development stage: ［`concept / prototype / vertical-slice / store-live / demo / prelaunch / launched`］
- Decision horizon: ［今回決める範囲と日付］
- Target player: ［対象playerと使用場面］
- Team capacity / runway: ［既知値、assumption、missingを分離］
- Next irreversible commitment: ［公開、外注、event登録、release date等］
- Blocking evidence: ［commitment前に必要な根拠］

### Core Experience Map

`projectBrief`由来の値は`declared`であり、player evidenceではありません。対応するasset、build、third-party responseがあれば別Evidence IDを付けます。

| Field | Current hypothesis | Evidence | Status |
|---|---|---|---|
| targetPlayer / themeWorld | ［誰に、どんな世界か］ | ［projectBrief / Evidence ID］ | ［declared / observed / inferred / missing］ |
| distinctiveSystem / repeatedAction | ［固有systemと反復行動］ | ［Evidence ID］ | ［status］ |
| playerDecision / systemResponse | ［判断と応答］ | ［Evidence ID］ | ［status］ |
| immediateReward / transitionReward / rewardAmplifier | ［即時報酬、変化の報酬、増幅要素］ | ［Evidence ID］ | ［status］ |
| oneSentencePromise | ［1文で理解できる約束］ | ［理解test Evidence ID］ | ［status］ |
| Known Frame + Meaningful Difference | ［理解しやすい型と体験を変える差分］ | ［Evidence ID］ | ［status］ |

### Concept Test Trace

`conceptTest`がない場合はmissing理由と次に必要なstimulus / participant条件を記録します。ある場合もsample内の件数だけを示し、固定合格率、母集団比率、conversion、purchase予測へ変換しません。個人情報は記載せず、仮名の`participantId`または集計だけを使います。

- Evidence ID / artifact path: ［manual intel］
- Tested at / stimulusId: ［ISO日時 / ID］
- Stimulus / exposure protocol: ［何を、何秒、どの順序で見せたか］
- Recruitment / target player definition: ［募集元、target fitの判定基準］
- Questions asked: ［誘導を避けた質問］
- Deviations / limitations: ［順序、moderation、言語、sample boundary］

| Observation | Counts | Confusions / unaided summary | Interpretation limit |
|---|---|---|---|
| understoodAction | ［yes / no / unclear / not-measured］ | ［反復行動の理解 / 混乱］ | action理解だけをfunや需要にしない |
| understoodReward | ［yes / no / unclear / not-measured］ | ［報酬の理解 / 混乱］ | reward理解をaction理解で補完しない |
| interest | ［would-play / maybe / would-not-play / not-asked］ | ［理由 / 未質問］ | purchaseや継続の証明ではない |

### Promise-Delivery Trace

| Promise claim | Promise asset / Evidence ID | Intended build moment | Delivered evidence | Match status | Decision impact |
|---|---|---|---|---|---|
| ［購入前に約束する体験］ | ［capsule / trailer / copy］ | ［build / task / state］ | ［playtest / telemetry / missing］ | ［matched / overpromised / under-signaled / missing］ | ［施策］ |

### Funnel Health

`impression → store visit → wishlist → demo start → demo completion → purchase → retained play`の各段階を、同じcohortとwindowで可能な範囲まで記録します。wishlistを面白さや販売本数の単独原因にしません。

| Stage | Metric | Source / instrument | Cohort / Window | Status | Interpretation limit |
|---|---|---|---|---|---|
| ［stage］ | ［metric］ | ［source］ | ［cohort / window］ | ［observed / estimated / missing］ | ［因果境界］ |

### Milestone Readiness

- Current gate: ［`concept / prototype / store-reveal / demo-next-fest / release-date / launch / post-launch`］
- Result: ［pass / blocked］
- Required evidence present: ［Evidence IDs］
- Smallest evidence to unblock: ［build、asset、participant、report］
- Current Steamworks rules checked at: ［URL / accessedAt、またはN/A］

### Experiment Queue

| Priority | Hypothesis | Stage | Primary metric | Guardrail | Smallest build / asset | Experiment ID |
|---|---|---|---|---|---|---|
| 1 | ［検証可能な仮説］ | ［gate］ | ［1件］ | ［悪化停止条件］ | ［最小変更］ | ［prospective ID / not registered］ |

### Survival Scenarios

| Scenario | Revenue assumptions | Cost / fee / refund / tax assumptions | Runway impact | Decision |
|---|---|---|---|---|
| conservative / base / upside | ［project固有値 / missing］ | ［固定値にしない］ | ［months / missing］ | ［continue / reduce-scope / seek-funding / stop］ |

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

## Update Strategy

更新やroadmapを扱う場合は`update-strategy.md`に従います。扱わない場合は、topicとSelected Domainsに基づくN/A理由を1文で記します。

### Update inventory

| Game / appid | Window / scope | Tagged patch notes | Inferred updates | Type mix | Median interval | Latest | Warning / limitation | Evidence ID |
|---|---|---:|---:|---|---:|---|---|---|
| ［game］ | ［取得範囲］ | ［件数］ | ［件数］ | ［分類］ | ［days / N/A］ | ［ISO］ | ［heuristic・underfilled等］ | ［ID］ |

更新頻度はdescriptiveであり、開発速度・品質・retention・売上効果ではありません。Steam由来の`patchnotes` tag、titleによるupdate inference、heuristic typeを分け、`platformHints`がある項目は対象platformを確認します。

### Persona Update Impact Matrix

| Persona | Adoption trigger | Retention trigger | Churn trigger | Update reaction | Status | Evidence / limitation |
|---|---|---|---|---|---|---|
| ［persona ID］ | ［trigger］ | ［trigger］ | ［trigger］ | ［再評価・復帰・無反応等］ | ［observed / inferred / unknown］ | ［voice / evidence_basis / limitation］ |

### Prioritized Update Backlog

| Decision | Player problem | Persona / Flow | Evidence | Smallest update | Expected player response | Confidence | Validation | Guardrail |
|---|---|---|---|---|---|---|---|---|
| ［fix-now / test-next-build / investigate / defer］ | ［問題］ | ［対象］ | ［ID / missing］ | ［最小変更］ | ［行動仮説］ | ［高/中/低］ | ［build・指標・期間］ | ［停止・rollback条件］ |

競合precedentは実装可能性の参考に留め、対象ゲームのplayer problem根拠がなければ`investigate`または`defer`にします。

## Domain Findings

以下の各項目は、`baseline` では現状だけ、`change` では現状 vs 変更案を記入します。Selected Domains の選択外なら、所見を作らず、冒頭と同じ明示的な N/A 理由だけを記録します。

### ゲームプレイ

- Status: ［Selected / N/A と理由］
- Mode result: ［プレイヤーから観測できるコアループ、目標、入力→反応、進行、失敗→再挑戦、継続動機 / change の場合は現状 vs 変更案］
- Playtest protocol: ［build ID、player task、start state、end state、platform、controls、duration、tester prior knowledge / 未実施ならmissing理由］
- Playtest observations: ［time to first meaningful action、task completion、Action → response、誤入力、feedback、failure → retry、次目標の認識とEvidence ID］
- Human-validity boundary: ［AI 1 testerの観測を人間のfun、completion rate、retentionの代表値へ変換しない］
- 観測とproxyの境界: ［仕様・build・動画・telemetry・playtestによる直接根拠 / description・categories・tags・reviewsによるプレイヤー知覚のproxy］
- 未検証の内部ロジック: ［コード、状態遷移、数式、難易度曲線など、直接根拠がなく断定できないもの］
- ペルソナ反応: ［gameplay / difficulty / grind / replayability等のvoice出典］
- 根拠: ［`steam_fetch` / `steam_reviews` / 提供仕様・build・playtestの Evidence ID。なければ「根拠不足」］

### ストア訴求

- Status: ［Selected / N/A と理由］
- Mode result: ［短文・詳細説明の価値提案、想定プレイヤー、独自性、CTA、スクリーンショットとの整合、期待と実プレイ評価の差 / change の場合は現状 vs 変更案］
- Copy比較: ［`localizedStorefronts`のenglish / japanese / german。requested localeとSteam fallbackの可能性を明記。`matchesEnglishCopy` は正規化後の完全一致・非一致だけを示し、true / falseどちらもfallbackの理由や翻訳品質の証明ではない］
- Visual比較: ［対象と競合のstore page、Steam Sonar game dashboard、capsule / screenshots。未取得なら「根拠不足」］
- ペルソナ反応: ［購入前期待、価値、誤解に関するvoice出典］
- 根拠: ［`steam_fetch` / `ui_capture` / `steam_reviews` の Evidence ID。なければ「根拠不足」］

### UI

- Status: ［Selected / N/A と理由］
- Benchmark task: ［playerの目的、開始状態、完了状態］
- Cohort conditions: ［qualityTier、2〜4本の出荷済みreference、screen state、platform、controls、aspect ratio / mismatch］
- Mode result: ［現状の発見可能性、可読性、階層、操作フィードバック / change の場合は現状 vs 変更案］
- ペルソナ反応: ［persona ID と voice 出典］
- 比較方式: ［blind comparison: opaque alias、固定済みpre-reveal判定、正解開示後の解釈 / memoryを隔離できない場合はnon-blind structured comparisonと理由］
- Reference provenance: ［Game UI Database / Interface In Game / その他のsource page URL、accessedAt、game、screen state、capture IDを持つEvidence ID］
- Evidence boundary: ［static screenshot / video / interactive observation。未表示state、motion、latency、controller feelは直接証拠がなければunscored］

| Axis | Target | Reference median | Gap | Evidence IDs | Observation / location | Confidence |
|---|---:|---:|---:|---|---|---|
| Task clarity | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［target - median / N/A］ | ［ID］ | ［画面位置と観測］ | ［高 / 中 / 低］ |
| Information hierarchy / glanceability | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［差 / N/A］ | ［ID］ | ［画面位置と観測］ | ［高 / 中 / 低］ |
| Density / typography / localization-safe legibility | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［差 / N/A］ | ［ID］ | ［画面位置と観測］ | ［高 / 中 / 低］ |
| Input / focus / affordance | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［差 / N/A］ | ［ID］ | ［画面位置と観測］ | ［高 / 中 / 低］ |
| State / feedback / recovery | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［差 / N/A］ | ［ID］ | ［画面位置と観測］ | ［高 / 中 / 低］ |
| Accessibility / color independence | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［差 / N/A］ | ［ID］ | ［画面位置と観測］ | ［高 / 中 / 低］ |
| Visual-system consistency / production finish | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［差 / N/A］ | ［ID］ | ［画面位置と観測］ | ［高 / 中 / 低］ |
| Flow / motion / interruption cost | ［0〜4 / unscored］ | ［0〜4 / unscored］ | ［差 / N/A］ | ［ID］ | ［画面位置と観測］ | ［高 / 中 / 低］ |

- Material deficits: ［gap <= -1 かつbenchmark taskを阻害する軸］
- Demonstrated strengths: ［gap > 0 で変更時に保持する軸］
- UI limitations: ［static-only、cohort mismatch、匿名化不能、missing state、利用条件による未取得］
- 根拠: ［画像とreference provenanceのEvidence ID。なければ「根拠不足」］

### 価格

- Status: ［Selected / N/A と理由］
- Mode result: ［現状の地域別価格、値引き幅、価格期待、購入タイミング / change の場合は現状 vs 変更案］
- ペルソナ反応: ［price_sensitivity と voice 出典］
- 根拠: ［`steam_fetch` / `steam_timeline` の Evidence ID。なければ「根拠不足」］

### ローカライズ

- Status: ［Selected / N/A と理由］
- Mode result: ［現状の対応言語、翻訳調、フォント、文化的含意、入力表示 / change の場合は現状 vs 変更案］
- Store copy: ［`localizedStorefronts`のrequested locale / `matchesEnglishCopy` / fallback注意。完全一致値または対応言語一覧だけで翻訳品質を判定しない］
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

- `observed`: source が観測時点の実値を返した通常ケース。`observedAt` と観測範囲を併記し、履歴や将来値へ一般化しない。
- `reported-zero`: source が明示的に 0 を返した値。ただし SteamSpy `average_forever=0` のように仕様上、欠損相当と扱う場合は、原値と解釈を両方記録する。
- `missing`: source が値を返さなかった、または取得できなかった状態。0 で補完しない。
- `estimated`: 推定値。推定主体、方法、範囲、caveat を併記する。SteamSpy `owners` は所有数の推定であり、売上本数ではない。

## Data Coverage Matrix

`evidence-coverage.md`にあるSelected Domainごとの固定dimensionを省略せず、`observed / reported-zero / estimated / missing / N/A`のいずれかで記録します。取得失敗をN/Aへ変えず、N/Aには具体的なscope理由を付けます。

| Domain | Dimension | Status | Evidence IDs | Limitation / mismatch | Decision impact |
|---|---|---|---|---|---|
| ［domain］ | ［固定dimension］ | ［status］ | ［ID / なし］ | ［観測範囲・不一致］ | ［confidence・勧告への影響］ |

- Coverage rate: ［`(observed + reported-zero + estimated) / applicable dimensions` をdomain別・全体で記録］
- Direct observation rate: ［`(observed + reported-zero) / applicable dimensions` をdomain別・全体で記録］
- Blocking missing dimensions: ［意思決定を止めるmissingと、その取得条件］

coverageはデータ充足率であり、結論の正しさや成功確率ではありません。blocking dimensionがmissingなら、平均coverageだけを理由にconfidenceをhighにしません。

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
