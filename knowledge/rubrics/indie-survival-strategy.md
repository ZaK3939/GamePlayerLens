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

`run-sim`の`projectBrief`にある値は、開発者が宣言した`declared design intent`としてCore Experience Mapへ配置します。保存済み仕様として追跡できますが、player evidence、市場需要、実装済み体験の観測には数えません。briefの各claimを、store asset、third-party理解test、build moment、human playtest、telemetryのどれで確認したかを別に記録します。未入力fieldを推測で埋めず、current gateをblockingするmissingを優先します。

`projectBriefDiagnostics`はCore Experience、Differentiation、Decision Contextごとの入力inventoryです。開発中対象のroute readinessには、対象player、企画入口に応じたtheme / system / reward、`oneSentencePromise`、`coreProofMoment`が必要です。`coreProofMoment`はtheme、action、system response、rewardが最短で観測できるはずのscene / state / interactionという宣言であり、実装済み・伝達成功・funの証拠ではありません。`mechanismTransfer`はimitation / Known Frameで`sourceAction`、`sourceSystemResponse`、`sourceReward`、`meaningfulDifference`の欠落を示します。field presenceは内容の質、fun、market fit、milestone readiness、参照作品の内部設計を証明しません。missing一覧は確認質問と次の検証を絞るためだけに使います。`revisionId`は後続testが見たbrief版を特定するprovenanceであり、新しい版や大きい番号を高品質とみなしません。

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
  "rewardMechanisms": [{
    "family": "mastery",
    "form": "mixed",
    "beforeState": "安全な航路がまだ分からない",
    "playerAction": "forecastを読みrouteを確定する",
    "systemResponse": "風、燃料、荷傷み、到着時刻が選択へ反応する",
    "afterState": "route predictionの成否が判明する",
    "perceivedReward": "予測が成立し配達を完了できる手応え",
    "amplifier": "接近する嵐、音、機体animation、受取人の反応"
  }],
  "oneSentencePromise": "嵐を読み切る航路設計で、小さな空の郵便網を守るゲーム",
  "coreProofMoment": "嵐の進路を見て航路を引き直すと、風、燃料、荷傷み、到着結果が即座に変わる",
  "knownFrame": "route-planning management",
  "meaningfulDifference": "forecast uncertaintyを線として描き直せる"
}
```

reward familyは`sensory / mastery / discovery / agency / attachment / aesthetic-emotion`を候補にします。網羅表でも重み付きscoreでもありません。体験そのものが報酬になる場合と、緊張→安堵、弱い→強いなど体験の変化が報酬になる場合を分けます。

`projectBriefDiagnostics.rewardMechanism`は宣言件数、family / form件数、amplifier件数を返します。これは入力inventoryであり、playerが実際に報酬を感じた件数やfun scoreではありません。

### Concept Origin Route

`projectBrief.conceptOrigin`は企画の優劣ではなく、次に不足側を聞くためのroutingです。未入力なら内容から推測せず確認します。

| conceptOrigin | Starting point | Required counterpart / concrete next question |
|---|---|---|
| `theme-first` | 興味を引くtheme / world | このthemeだから自然に生まれる`distinctiveSystem`、反復action、system responseは何か |
| `system-first` | 尖ったaction / system | このsystemを理解しやすくし、rewardへ感情的意味を与えるthemeは何か |
| `holistic-image` | ぼんやりした全体像やscene | themeと反復可能なsystemへ分解し、観測できるaction → response → rewardへ具体化できるか |
| `imitation` | 既知作品やgenre frame | 表層featureではなくsourceの体験機構を抽出し、targetでplayer experienceを変える差分は何か |

routeのfieldが埋まっても企画品質やfunをpassにしません。`theme-first`と宣言したのにthemeがない、`imitation`なのにsource mechanismまたはmeaningful differenceがない場合は、実装量を増やす前に`needs-counterpart`として確認します。

### Reward Mechanism Trace

reward名だけで「面白い」と判定せず、どの状態と反応からその報酬が生まれる仮説かを固定します。

| Reward family | Reward form | Before state | Player action | System response | After state / perceived reward | Amplifier | Evidence / status |
|---|---|---|---|---|---|---|---|
| ［sensory等］ | ［`inherent / transition / mixed`］ | ［開始状態・感情］ | ［観測可能なaction / decision］ | ［即時feedback・状態変化］ | ［結果状態とplayerが感じる仮説］ | ［音、animation、timing、関係性等］ | ［declared / build / playtest / missing］ |

`inherent`は操作、鑑賞、関係など体験そのものが報酬になる仮説、`transition`は緊張→安堵、失敗→上達、弱い→強いなどbefore / afterの変化が報酬になる仮説です。派手なeffect、coin、level-up UIはsystem responseまたはamplifierであり、それだけでperceived rewardを観測したことにはしません。

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

### Mechanism Transfer Map

`conceptOrigin=imitation`、Known Frameを使う場合、またはcompetition分析で競合から学ぶ場合に作ります。それ以外はN/A理由を残します。

`projectBrief`に`sourceAction`、`sourceSystemResponse`、`sourceReward`がある場合はsource loopのdeclared hypothesisとして対応付けます。これらが埋まってもsource evidenceを観測したことにはせず、直接play、recording、仕様、複数player evidenceのどれで確認したかを別列に残します。`mechanismTransfer.status=source-mechanism-missing`なら、表層featureからloopを補完せず3 fieldを一つの質問で確認します。

| Source / Evidence | Surface feature | Source action → response → reward | Transferable mechanism | Target adaptation | Target proof / status |
|---|---|---|---|---|---|
| ［作品 / build・video・review等］ | ［camera、敵数、upgrade UI等］ | ［sourceで観測できる体験構造］ | ［themeを外しても残るdecision、tension、feedback等］ | ［target theme / systemでどう変えるか］ | ［prototype moment / missing］ |

surface featureの一致はmechanismの証拠ではありません。sourceを直接play、recording、仕様、複数のplayer evidenceのいずれでも確認できない場合はproxyとし、内部loopを断定しません。target adaptationは少なくともaction、decision、response、rewardの1つを変え、sourceの劣化コピーではなくなる理由と最小proof momentを示します。

## 4. Core learning loop

Core Experience Mapを埋めただけでは企画のreadinessをpassにしません。declared hypothesisを、第三者のunaided response、動くbuild、first-contact assetへ順に接続します。

### Core Legibility Gate

次の5問を別々に判定し、`declared / observed / contradicted / missing`とEvidence IDを記録します。1問の成功で他を補完せず、合計scoreへ変換しません。

| Check | Question | Required evidence | Failure diagnosis boundary |
|---|---|---|---|
| theme-specific play | この`themeWorld`だから自然に生まれるaction / systemか | briefと第三者のunaided teach-back | 理解失敗と好み不一致を分ける |
| theme-system fit | `distinctiveSystem`がthemeを体験として強めるか | build momentまたは具体的prototype | 題材の珍しさだけをfitにしない |
| experience → reward | playerが何をし、どう反応を受け、何を報酬として感じる仮説か | action → response → rewardの観測 | 説明できることをfun実測にしない |
| one-sentence teach-back | 答えを教えず、第三者が反復actionとrewardを自分の言葉で要約できるか | `unaidedSummary`、質問、protocol | 「分かりましたか」への同意を理解にしない |
| core proof moment | `coreProofMoment`がtheme固有のaction → response → rewardを、追加説明なしで短いassetまたはbuild momentとして示すか | capture / trailer位置 / playable stateと第三者のunaided response | 宣言、実装、asset掲載、第三者理解を別statusにする |

`oneSentencePromise`は短ければpassではありません。複数の売りを列挙して焦点が不明なら、何を残すか決めて新revisionへ進みます。strange premise、shock、既存作名だけでactionとrewardを想像できない場合は、catchではなく未検証のnoveltyとして扱います。

### Core Revision Ledger

| Brief / Stimulus / Build revision | Observed issue | Variable changed | Invariants kept | Evidence / Retest | Outcome |
|---|---|---|---|---|---|
| ［revision IDs］ | ［理解、操作、reward、assetの問題］ | ［theme / system / experience / reward / presentation］ | ［変えなかった条件］ | ［artifact / cohort / protocol］ | ［resolved / changed / unresolved］ |

concept testの再検証では、新しい`stimulusId`に`parentStimulusId`、`changeSummary`、`changedVariables`、`invariantsKept`をすべて付けます。不完全な比較設計は受理しません。因果を比較したい場合は一度に変えるcoreまたはasset変数を1つに絞り、一度に変えた変数が複数なら何が効いたかの因果帰属を`unresolved`にします。1変数と維持条件を宣言しても比較候補にすぎず、親testのprotocol equivalenceや因果を証明しません。定期的なexternal feedbackとplaytestは推奨しますが、毎月などの固定cadenceにはしません。team capacity、build cost、decision horizonに合わせて、irreversible commitmentより前に十分な反復機会を置きます。

同じ相手との相互reviewは継続しやすさに役立つ場合がありますが、友人関係やreciprocity biasをdeviationに残します。指摘された数ではなく、次revisionでunaided explanationや同じtaskの行動がどう変わったかを比較します。

### First-contact Asset Readiness

購入前に最初に見えるものを、制作側の説明ではなく実際の表示contextで監査します。

| Asset / Context | Exposure condition | Visible theme | Imagined action | Imagined reward | Immediate reject risk | Evidence | Status |
|---|---|---|---|---|---|---|---|
| capsule / key visual、第一viewport、最初に見えるscreenshots、trailer / microtrailer、demo entry | ［device、viewport、duration、sound、order］ | ［観測］ | ［unaided response］ | ［unaided response］ | ［Not for me / unreadable / wrong expectation］ | ［capture / participant / artifact］ | ［core-visible / theme-only / system-only / unreadable / untested］ |

visual qualityは装飾量ではなく、target playerがtheme、action、reward、状態を誤解なく読めるかをmatched referenceと実表示で確認します。必要qualityへteam内で到達できない場合は、外注、scope reduction、visual languageの変更を同じcost / runway boundaryで比較します。生成AIや自動化でassetを速く作れても、人間のfun、taste fit、visual trustをcertifyしないため、実際のfirst-contact testを省略しません。

「最初の4枚」「30秒PV」のような数や長さはasset案の例であり固定合格条件ではありません。第一viewport、現在のSteam表示、trailer / microtrailerの実contextを確認し、coreのproof momentがいつ現れるかを測ります。fixed asset countを満たしても、themeだけでaction / rewardが見えないなら`theme-only`です。

`firstContactTest`を使う場合は、asset IDとtype、device、viewport、duration、sound、order、募集条件、質問、匿名participantごとの`visualQuality`、`understoodTheme`、`themeAppeal`、action / reward理解、`tryIntent`、`immediateReject`を保存します。theme appealはtheme comprehensionと別であり、「世界観を理解した」を「その世界観が好み」に変換しません。`rough / style-mismatch`には`visualQualityReason`、`themeAppeal=no / unclear`には`themeAppealReason`、`tryIntent=maybe / no`には`tryIntentReason`を要求します。promptの`firstContactTestEvidence.resultHandle`で正規化済み入力をexact-saveし、理由をsummaryやconfusionから推測しません。try intentはこのassetを見た直後のbounded self-reportであり、purchase、需要、conversion、retained playを証明しない。診断はこのbounded sampleと表示contextの知覚件数であり、客観的制作品質、store conversion、需要、fun、readiness scoreを証明しません。

## 5. Human validation and playtest

- concept説明テストとgameplay playtestを分ける。説明理解はfunの実測ではありません。
- `conceptTest`を使う場合は、`stimulusId`、再検証なら必須の`parentStimulusId`、`changeSummary`、`changedVariables`、`invariantsKept`、任意の`projectBriefRevision`、`promiseShown`、提示内容・手順、`recruitment`とtarget player定義、`questionsAsked`を保存し、誰がどのbrief版の何を見て何を聞かれたかを再現可能にする。promptの`conceptTestEvidence.resultHandle`で正規化済み入力をexact-saveし、モデルによる転記を挟まない。
- `projectBriefRevision`と`revisionId`、`promiseShown`と`oneSentencePromise`は完全一致だけをprovenanceとして判定する。mismatched / unlinkedを隠さず、文字列一致から理解、訴求力、品質を採点しない。
- participantごとの`understoodTheme`、`themeSystemFit`、`understoodAction`、`understoodReward`、`interest`を別の観測として扱う。themeを認識したこと、themeとsystemが噛み合うと感じたこと、行動・報酬を理解したこと、試したいと答えたことを相互に補完しない。`themeSystemFit=no / unclear`ではparticipant自身の`themeSystemFitReason`を保存し、他回答から理由を補完しない。`teachBackAudit`で`understandingMarkedYesWithoutSummaryCount`を確認し、評価者がyesを付けても`unaidedSummary`がなければ第三者自身の説明として監査可能とは扱わない。
- 「面白そうと言った率」などの固定thresholdは採用しない。sample内の件数は記述値であり、母集団のconversionやpass条件に変換しない。`interest`は`purchase`、需要、継続を証明しない。
- `participantId`は匿名の仮名IDに限定し、氏名、email、連絡先などの個人情報を入力・保存しない。schemaの自動検出はemail形式だけなので、電話番号、住所、氏名、account IDなども自由記述とともに共有前に匿名化する。
- AI playtestは操作可能性、feedback、再現可能なfrictionを観測できます。human playtestのfun、需要、completion、retentionの代表にはしません。
- `playtestSession`を使う場合は、session / build、task、start/end state、構造化した`executionEnvironment`、controls、tester type、prior knowledge、時系列のAction / system response / friction / rewardSignalを保存する。`executionEnvironment`はOS、device、runtime、renderer backend / implementation、hardware / software acceleration、viewport / DPRを分離する。promptの`playtestSessionEvidence.resultHandle`で原本をexact-saveし、AI-operated sessionとhuman participantの`humanReport`を混同しない。1 sessionはDelivered Experienceのbounded evidenceであり、fun、completion rate、retention、需要の率ではない。
- software-rendered sessionはそのcompatibility pathの観測に限定し、hardware-rendered player環境のlivenessやperformanceへ一般化しない。hardwareでも記録したdevice、runtime、renderer implementation、viewport以外へ自動一般化しない。
- 通常のretestは`parentSessionId`と完全なchange designを持たせ、親session原本を読んでtask、executionEnvironment、controls、start state、cohort、observation sourceを照合する。複数変更や条件差を因果改善と呼ばず、事前criterionを持つ比較は`experiment.md`へ進める。
- 複数sessionは`playtestCohort`でexact-saveし、session、unique human participant、repeat exposure、AI / human、outcome、friction、reward evidence、protocol groupを件数で分離する。少数cohortの件数をfun、completion、retention、需要の率へ変換せず、repeat participantを独立sampleにしない。
- cohort内retestはparent / current原本のprotocol、participant exposure、変更変数、evidence transitionをCore Revision Ledgerへ残す。recorded field一致と単一変更は比較候補であり、free-text invariantや因果改善の証明ではない。
- moderatorの誘導、友人関係、順序bias、build差をdeviationsへ残す。
- 指摘件数ではなく、同じtaskで行動がどう変わるかをsuccess criterionへ使う。
- `conceptTestDiagnostics.revisionLoop.candidateReviewAreas`は次に調べる候補であり、原因判定ではありません。該当fieldを自動的に失敗扱いしたり、複数変更の効果を1変数へ帰属したりしません。

変更をprospectiveに検証する場合は`experiment.md`に従い、結果を見る前にExperimentSpecを保存し、Prediction Runを封印し、測定後にExperimentOutcomeを保存します。

## 6. Funnel Health

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

## 7. Milestone Readiness

日付から逆算するだけでなく、player evidenceとasset evidenceが揃ったかをgateにします。

| Gate | Required evidence | Block if |
|---|---|---|
| `concept` | Core Legibility Gate、oneSentencePromise、coreProofMoment、target-playerのunaided teach-back | theme-system fit、action / reward、proof momentが説明不能、revisionが追跡不能 |
| `prototype` | core action → response → rewardが動くbuild、Core Revision Ledger、bounded playtest | coreを未実装のままcontent量を増やす |
| `store-reveal` | First-contact Asset Readiness、Promise-Delivery Trace、capsule、first visible screenshots、trailer proof moment | 第一接触でcoreがunreadable、promiseとbuild momentが結び付かない |
| `demo-next-fest` | coreへ到達できるstable demo、store page、current tags、trailer、feedback instrument | crash、core未到達、測定不能 |
| `release-date` | scope、QA、localization、support、launch buildのconfidence | marketing都合だけで日付を固定 |
| `launch` | price/package、release checklist、support、measurement plan | blocking defect、rollback不能 |
| `post-launch` | observed player problem、update hypothesis、success / guardrail | cadenceや競合模倣だけで更新 |

Steam Next Festは現行の公式Steamworks要件を毎回確認します。公式documentationではNext Festは1作品につき1回だけで、公開store pageと公開demoなどのeligibilityがあります。日付やdeadlineを記憶で固定せず、[Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)と[Upcoming Steam Events](https://partner.steamgames.com/doc/marketing/upcoming_events)を実行時に確認します。

作品発表、demo / Next Fest、release-date発表、launchは有用なplanning checkpointですが、宣伝機会が4回だけという固定モデルは採用しない。themed Fests、Steam Playtest、announcement、discount、community、press、creator outreach、post-launch updateなどをproject固有に評価します。post-launchには公式のUpdate Visibility Roundもあります。

Steamは最初のstore trailerから6秒のmicrotrailerを生成するため、first trailer全体でcoreのproof momentが複数位置に現れるか確認します。固定30秒を合格条件にせず、最初の数秒、microtrailer、full trailerを別asset / contextでtestします。[Steam Trailers](https://partner.steamgames.com/doc/store/trailer)をcurrent ruleのsourceにします。

## 8. Capability Reinvestment Gate

「まず面白い小さな作品を作り、利益を見た目や制作能力へ再投資する」という方向は、固定の販売本数、期間、手数料、税率、再投資率として採用しません。現在のplayer-facing bottleneck、手元資金、runway、担当能力、継続運用費、戻せる範囲をproject固有に確認します。

| Decision | Bottleneck | Evidence ID | Capacity / runway boundary | Reversible next step | Expansion trigger |
|---|---|---|---|---|---|
| ［learn / simplify / outsource / hire / defer / not-applicable］ | ［観測済み制約］ | ［E-###］ | ［予算・担当・期間・運用費 / missing］ | ［paid test、one asset、one subsystem等］ | ［次のplayer / asset / financial evidence］ |

- `outsource`や`hire`は、品質差またはcapacity bottleneckのEvidence ID、支払可能額、runway、受入・修正担当、終了条件が揃う場合だけ選ぶ。固定契約前にone asset / bounded paid testなどreversibleな単位で検証する。
- `learn`は習得期間と失う開発時間、`simplify`はcore promiseへの影響、`defer`は次の見直しtriggerを残す。
- online co-op / versus、story / character expansion、live operations、genre constraintなどは単なる「面白さの底上げ」ではない。server / moderation / matchmaking / content production / supportといったscope・運用依存、失敗mode、core rewardへの具体的寄与を示す。証拠がなければ追加せず`defer`する。
- 売上やwishlistが得られても、どのbottleneckへ再投資すべきかは自動決定しない。visual trust、theme appeal、play / reward legibility、Delivered Experienceのどこが制約かを先に分ける。

## 9. Repair Backlog

crash、capture receipt不整合、決定論capture失敗、main-thread stall、計測不能など、次の仮説検証を成立させるための前提修復をここへ置きます。

| Priority | Blocking failure | Evidence ID | Owner surface | Success gate | Must not change |
|---|---|---|---|---|---|
| 1 | ［再現可能なfailure］ | ［E-###］ | ［runtime / capture / build / instrumentation］ | ［同一条件での復旧判定］ | ［production contract / invariant］ |

- repairは既知failureの解消であり、player、asset、market仮説のExperimentOutcomeではない。
- repair成功をfun、需要、品質、継続率の改善として数えない。修復後に独立したplayer-facing validationを行う。
- success gateを通すためにreceipt semantics、画質、native resolution、対象buildなどのcontractを弱めない。

## 10. Experiment Queue

最大3件に限定します。4件以上ある場合は現在のirreversible commitmentを最も動かす3件だけを残し、残りは次回候補にします。repair、環境構築、単なるcapture取得はここへ混ぜません。

| Priority | Hypothesis | Stage | Primary metric | Source | Guardrail | Smallest build / asset | Experiment ID |
|---|---|---|---|---|---|---|---|
| 1 | ［行動仮説］ | ［gate］ | ［1件］ | ［human-playtest / telemetry等］ | ［悪化停止］ | ［最小変更］ | ［prospective ID / not registered］ |

- core hypothesis、promise hypothesis、distribution hypothesisを別ExperimentSpecにする。
- primary metricは1件にし、wishlistとfunを同じmetricへ平均しない。
- asset A/Bが勝ってもDelivered Experience改善とは扱わない。
- missing outcomeもunresolvedとして保存し、成功へ補完しない。

## 11. Project-specific survival model

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

## 12. Required output

適用時はevaluationに次を含めます。

1. Indie Strategy Card: stage、decision horizon、runway、irreversible commitment、blocking evidence。
2. Core Experience Map: required fields、reward family、theme-system fit、oneSentencePromise、coreProofMoment。
3. Concept Origin Route: 宣言した起点、不足counterpart、次の具体化質問。
4. Reward Mechanism Trace: reward form、before / after state、action、response、amplifier、evidence。
5. Mechanism Transfer Map: imitation / competition適用時のsurfaceとsource mechanism、target adaptation、proof。適用外はN/A理由。
6. Core Legibility Gate: theme-specific play、theme-system fit、experience → reward、unaided teach-back、core proof moment。
7. Core Revision Ledger: revision lineage、変えた変数、維持条件、retest、未解決の因果境界。
8. First-contact Asset Readiness: 実表示context、visual quality、theme legibility / appeal、action / rewardのlegibility、try intent、immediate reject risk。
9. Concept Test Trace: stimulus、protocol、sample、action理解、reward理解、interest、confusion、deviation、解釈限界。
10. Promise-Delivery Trace: promiseとbuild momentの対応。
11. Funnel Health: exposureからretained playまでのstatusと欠損。
12. Milestone Readiness: current gate、pass / blocked、必要な最小証拠。
13. Capability Reinvestment Gate: bottleneck、Evidence ID、capacity / runway、reversible next step、expansion trigger。
14. Repair Backlog: blocking failure、Evidence ID、owner surface、復旧gate、維持contract。Experimentと分離する。
15. Experiment Queue: 最大3件、primary metric、source、guardrail付き。
16. Survival Scenarios: conservative / base / upsideとassumption boundary。

数字がない場合は架空の販売本数やconversionを作らずmissingとし、次に取得するreport、build、participant、期間を指定します。

## 13. Source boundary

このrubricは調査過程や個別資料を公開するものではなく、複数の設計観点をGamePlayerLensのevidence integrityへ一般化した実行規則です。売上、conversion、税、開発期間、反応率の一般的な目安は、普遍的事実として採用しません。

Steam固有の現在仕様は、実行時に公式Steamworks documentationを再確認します。

- [Wishlists](https://partner.steamgames.com/doc/marketing/wishlist)
- [Visibility on Steam](https://partner.steamgames.com/doc/marketing/visibility)
- [Steam Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)
- [Upcoming Steam Events](https://partner.steamgames.com/doc/marketing/upcoming_events)
- [Trailers](https://partner.steamgames.com/doc/store/trailer)
- [Marketing tools](https://partner.steamgames.com/doc/marketing/tools)
