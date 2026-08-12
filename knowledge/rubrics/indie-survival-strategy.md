# Indie survival strategy rubric

目的は、インディーゲームの企画、prototype、store公開、demo、launch、post-launchを、単一の売上予言ではなく、検証可能な意思決定の連鎖にすることです。購入前の期待と購入後の体験、player evidenceとmarket signal、制作制約と成長目標を混同しません。

このrubricは「面白そう × 面白い」という整理を出発点にしますが、2値の掛け算や単一scoreへの変換は禁止します。片方の数値で他方を推測せず、`Appeal Promise`と`Delivered Experience`を別々のevidenceで判定します。

## 1. Applicability

topicがconcept、prototype、vertical slice、pitch、storefront、trailer、demo、Next Fest、wishlist、launch、marketing、roadmap、studio survivalのいずれかを扱う場合に適用します。通常のreview取得や価格照会だけならN/Aとし、理由を1文で残します。

適用時は最初に次を固定します。

- `developmentStage`: `concept / prototype / vertical-slice / store-live / demo / prelaunch / launched`
- `decisionHorizon`: 今回決める範囲と日付
- `targetPlayer`: 対象playerと使用場面
- `teamCapacity`: 人数、役割、外注可能範囲
- `runway`: 現金、利用可能月数、月次burnの既知 / unknown
- `nextIrreversibleCommitment`: 公開、外注、event登録、release date、launchなど戻しにくい判断
- `blockingEvidence`: その判断の前に必要なmissing evidence

## 2. Two ledgers: promise and delivery

### Appeal Promise

購入前にplayerが観測できるものを扱います。

- visual quality: capsule、最初のscreenshots、trailer、UI、animationの観測可能範囲
- theme legibility: 誰のどの「好き」を刺激する世界・題材か
- play legibility: 何を操作し、何を繰り返し、どの報酬を得るかを想像できるか
- familiar frame: 既知のgenre / loop / comparison titleから理解できる部分
- meaningful difference: 既知の型に対して何がplayer experienceを変えるか

### Delivered Experience

build、recording、playtest、telemetry、player reportから購入後の体験を扱います。

- core action / decisionが実際に可能か
- system responseが明瞭か
- intended rewardが発生したか
- friction、failure、retryがrewardを壊していないか
- first sessionからrepeated playへつながる理由が観測されたか

storefront copyやtrailerはAppeal Promiseのevidence、build操作やplaytestはDelivered Experienceの別のevidenceです。storefrontだけで「面白い」をobservedにせず、playtestだけで市場の購入意向をobservedにしません。

### Promise-Delivery Trace

| Promise claim | Promise asset / Evidence ID | Intended build moment | Delivered evidence | Match status | Decision impact |
|---|---|---|---|---|---|
| ［購入前に約束する体験］ | ［capsule / trailer / copy］ | ［build / task / state］ | ［playtest / telemetry / missing］ | ［matched / overpromised / under-signaled / missing］ | ［施策］ |

`overpromised`はassetを弱めるだけでなくbuildを改善する候補、`under-signaled`はgame coreを変えずpromise表現を改善する候補です。どちらか一方へ自動的に寄せません。

## 3. Core Experience Map

ゲームのcoreを「珍しい題材」やfeature listではなく、playerの体験と報酬へ分解します。

```jsonc
{
  "targetPlayer": "new keyboard-and-mouse tactics players",
  "themeWorld": "天候を読む小さな飛行船郵便局",
  "distinctiveSystem": "天候図へ航路を描き、配達順とriskを同時に決める",
  "repeatedAction": "forecastを読み、routeを描き、飛行を調整する",
  "playerDecision": "安全、時間、積荷価値のどれを優先するか",
  "systemResponse": "風向、燃料、荷傷み、到着時刻が即時に変化する",
  "immediateReward": "route predictionが当たり、安定飛行できる手応え",
  "transitionReward": "危険な空域を抜けて配達を完了する安堵と達成",
  "rewardAmplifier": "接近する嵐、音、機体animation、受取人の反応",
  "oneSentencePromise": "嵐を読み切る航路設計で、小さな空の郵便網を守るゲーム",
  "familiarFrame": "route-planning management",
  "meaningfulDifference": "forecast uncertaintyを線として描き直せる"
}
```

reward familyは`sensory / mastery / discovery / agency / attachment / aesthetic-emotion`を候補にします。網羅表でも重み付きscoreでもありません。体験そのものが報酬になる場合と、緊張→安堵、弱い→強いなど体験の変化が報酬になる場合を分けます。

### Theme-system fit

- `themeWorld`だからこそ`distinctiveSystem`が自然に理解できるか。
- `distinctiveSystem`が最も生きるtheme / worldか。
- `repeatedAction → systemResponse → reward`を一文で説明できるか。
- strange / shockingな設定だけで、触りたくなるplayer actionが欠けていないか。
- third-partyが理解できなかった箇所を、好みの否定と説明失敗に分けたか。

競合作品の表層、camera、敵数、upgrade UIだけを模倣しません。表層の模倣ではなく、どの体験がどの報酬を生むかを抽出し、自作品のthemeとsystemで再構成します。

### Known Frame + Meaningful Difference

既知の型は理解costを下げる入口として使えますが、comparison titleの劣化版を正当化しません。

- Known Frame: playerが既に理解できるloop、genre grammar、controls。
- Meaningful Difference: action、decision、response、rewardの少なくとも1つを変える差分。
- Proof moment: その差分が説明ではなく短い映像やplayable momentで分かる状態。

## 4. Human validation and playtest

- concept説明テストとgameplay playtestを分ける。説明理解はfunの実測ではありません。
- 「面白そうと言った率」の固定thresholdは採用しない。質問文、募集元、prior knowledge、target fit、sample sizeを保存する。
- AI playtestは操作可能性、feedback、再現可能なfrictionを観測できます。human playtestのfun、需要、completion、retentionの代表にはしません。
- moderatorの誘導、友人関係、順序bias、build差をdeviationsへ残す。
- 指摘件数ではなく、同じtaskで行動がどう変わるかをsuccess criterionへ使う。

変更をprospectiveに検証する場合は`experiment.md`に従い、結果を見る前にExperimentSpecを保存し、Prediction Runを封印し、測定後にExperimentOutcomeを保存します。

## 5. Funnel Health

購入前signalと購入後signalを次のfunnelへ置き、落ちた段階を特定します。

`impression → store visit → wishlist → demo start → demo completion → purchase → retained play`

| Stage | Metric | Source / instrument | Cohort | Window | Status | Interpretation limit |
|---|---|---|---|---|---|---|
| impression | placement impressions | Steam Traffic Breakdown等 | ［地域 / tag / event］ | ［期間］ | ［observed / missing］ | exposure opportunity |
| store visit | visits / CTR | same campaign source | same cohort | same window | ［status］ | creative / targetingの混合 |
| wishlist | additions / removals | Steam wishlist report | same cohort | same window | ［status］ | interest signal |
| demo | starts / completion | demo telemetry | build cohort | task window | ［status］ | delivered trial experience |
| purchase | units / net revenue | financial report | region / package | launch window | ［status］ | discount / refundを含む |
| retained play | return / playtime | telemetry / player research | player cohort | defined window | ［status］ | funの単一scoreではない |

wishlistは露出を受けた人の興味signalであり、gameの面白さ、発売本数、Steam上のalgorithmic visibilityを単独で証明しない。wishlistが伸びない場合も、exposure、placement、targeting、asset、price expectation、cohort、windowを確認せず「coreが弱い」を単独原因にしません。

Steamworksの`Marketing & Visibility > Traffic Breakdown`でplacement別impressionとstore visitを確認し、wishlist reportのaddition / purchase / deletionと観測期間を揃えます。外部campaignはUTM等、識別可能なinstrumentを使います。

## 6. Milestone Readiness

日付から逆算するだけでなく、player evidenceとasset evidenceが揃ったかをgateにします。

| Gate | Required evidence | Block if |
|---|---|---|
| `concept` | oneSentencePromise、Core Experience Map、target-player理解test | action / rewardが説明不能 |
| `prototype` | core action → response → rewardが動くbuild、bounded playtest | coreを未実装のままcontent量を増やす |
| `store-reveal` | Promise-Delivery Trace、capsule、first screenshots、trailer proof moment | promiseとbuild momentが結び付かない |
| `demo-next-fest` | stable demo、store page、current tags、trailer、feedback instrument | crash、core未到達、測定不能 |
| `release-date` | scope、QA、localization、support、launch buildのconfidence | marketing都合だけで日付を固定 |
| `launch` | price/package、release checklist、support、measurement plan | blocking defect、rollback不能 |
| `post-launch` | observed player problem、update hypothesis、success / guardrail | cadenceや競合模倣だけで更新 |

Steam Next Festは現行の公式Steamworks要件を毎回確認します。公式documentationではNext Festは1作品につき1回だけで、公開store pageと公開demoなどのeligibilityがあります。日付やdeadlineを記憶で固定せず、[Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)と[Upcoming Steam Events](https://partner.steamgames.com/doc/marketing/upcoming_events)を実行時に確認します。

作品発表、demo / Next Fest、release-date発表、launchは有用なplanning checkpointですが、宣伝機会が4回だけという固定モデルは採用しない。themed Fests、Steam Playtest、announcement、discount、community、press、creator outreach、post-launch updateなどをproject固有に評価します。post-launchには公式のUpdate Visibility Roundもあります。

Steamは最初のstore trailerから6秒のmicrotrailerを生成するため、first trailer全体でcoreのproof momentが複数位置に現れるか確認します。固定30秒を合格条件にせず、最初の数秒、microtrailer、full trailerを別asset / contextでtestします。[Steam Trailers](https://partner.steamgames.com/doc/store/trailer)をcurrent ruleのsourceにします。

## 7. Experiment Queue

| Priority | Hypothesis | Stage | Primary metric | Source | Guardrail | Smallest build / asset | Experiment ID |
|---|---|---|---|---|---|---|---|
| 1 | ［行動仮説］ | ［gate］ | ［1件］ | ［human-playtest / telemetry等］ | ［悪化停止］ | ［最小変更］ | ［prospective ID / not registered］ |

- core hypothesis、promise hypothesis、distribution hypothesisを別ExperimentSpecにする。
- primary metricは1件にし、wishlistとfunを同じmetricへ平均しない。
- asset A/Bが勝ってもDelivered Experience改善とは扱わない。
- missing outcomeもunresolvedとして保存し、成功へ補完しない。

## 8. Project-specific survival model

survival targetは販売本数だけで決めず、runwayとnext projectを含むproject固有の制約として計算します。

最低限、次を入力します。

- remaining development costとlaunch後support cost
- team compensationと外注commitment
- price / package / region / discount assumptions
- platform fee、VAT / sales tax、withholding / income taxの適用範囲
- refund、chargeback、publisher / recoup、currency effect
- conservative / base / upsideのnet revenue scenario
- 次projectへ再投資する額とrunway months

platform fee、refund、taxを固定値で一律計算しません。法域、契約、package、地域、discountで変わるため、未確認値はassumptionとして分離します。SteamSpy ownersは推定所有数であり、販売本数、net revenue、runwayへ直接変換しません。

販売本数、発売cadence、開発期間の一般的な目安はprojectの合格条件にせず、検証対象のassumptionに留めます。team size、scope、quality bar、cash need、genre、price、support burdenを入れたscenarioで、continue / reduce-scope / seek-funding / stopを判断します。

## 9. Required output

適用時はevaluationに次を含めます。

1. Indie Strategy Card: stage、decision horizon、runway、irreversible commitment、blocking evidence。
2. Core Experience Map: required fields、reward family、theme-system fit、oneSentencePromise。
3. Promise-Delivery Trace: promiseとbuild momentの対応。
4. Funnel Health: exposureからretained playまでのstatusと欠損。
5. Milestone Readiness: current gate、pass / blocked、必要な最小証拠。
6. Experiment Queue: 最大3件、primary metricとguardrail付き。
7. Survival Scenarios: conservative / base / upsideとassumption boundary。

数字がない場合は架空の販売本数やconversionを作らずmissingとし、次に取得するreport、build、participant、期間を指定します。

## 10. Source boundary

このrubricは調査過程や個別資料を公開するものではなく、複数の設計観点をGamePlayerLensのevidence integrityへ一般化した実行規則です。売上、conversion、税、開発期間、反応率の一般的な目安は、普遍的事実として採用しません。

Steam固有の現在仕様は、実行時に公式Steamworks documentationを再確認します。

- [Wishlists](https://partner.steamgames.com/doc/marketing/wishlist)
- [Visibility on Steam](https://partner.steamgames.com/doc/marketing/visibility)
- [Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)
- [Upcoming Steam Events](https://partner.steamgames.com/doc/marketing/upcoming_events)
- [Trailers](https://partner.steamgames.com/doc/store/trailer)
- [Marketing tools](https://partner.steamgames.com/doc/marketing/tools)
