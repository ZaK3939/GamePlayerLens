# ゲーム変更・マイルストーン評価テンプレート

このテンプレートは、プレイヤーが対象ゲームを知り、購入し、遊び続けるまでの流れを、実データに接地して評価するためのものです。主張ごとに Evidence ID を付け、末尾の Evidence Index で保存済み artifact へ追跡できるようにしてください。裏付けがない主張は断定せず、必ず「根拠不足」と記します。

Mode の規則を混同しないでください。`baseline` は現状だけを報告し、未提案の変更案を仮定しません。`change` だけが各評価を「現状 vs 変更案」で報告します。

Mode、Selected Domains、Decision Card (`Decision Check`)は必ずレポートの最初に記録し、詳細ledgerを読まなくても次の判断が分かるようにします。

- Mode: ［`baseline` | `change`］
- Selected Domains: ［`gameplay` / `storefront` / `ui` / `price` / `localization` / `competition` から選択］

## Decision Card

長文所見の前に、現時点の意思決定を1画面で固定します。根拠不足は自動的なNO-GOではなく、次工程の不可逆性とblocking evidenceで判定します。

- Verdict: ［`GO` / `HOLD` / `NO-GO`］
- Decision: ［`fix-now` / `test-next-build` / `investigate` / `defer`］
- Proven: ［直接支えられる内容とEvidence ID。1行1件、最大3行］
- Unproven: ［`missing` / `unproven` / `未証明` / `根拠不足`を明記。1行1件、最大3行］
- Highest risk: ［判断を最も変え得る問題または不確実性1件］
- Player problem: ［誰が、どの状態で、何に阻害されるか］
- Next validation: Test: ［最小変更 / test］ | Success signal: ［観測可能な成功条件］ | Guardrail: ［維持条件 / rollback］

Next validations はこの形式を1行1件、最大3行まで繰り返し、必ず`Guardrail / rollback`を明記します。
- Confidence: ［high / medium / low とblocking missing］
- Revisit condition: ［何が取得・発生したら判断を更新するか］

## Detailed Scope

| Domain | Status | 選択理由 / N/A 理由 |
|---|---|---|
| ゲームプレイ | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |
| ストア訴求 | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |
| UI | ［Selected / N/A］ | ［評価する理由、またはトピックと入力から見て対象外とする具体的理由］ |
| 価格 | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |
| ローカライズ | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |
| 競合 | ［Selected / N/A］ | ［評価する理由 / 明示的な N/A 理由］ |

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
| distinctiveSystem / primaryIntendedFeeling | ［固有systemと、その最短loopで最も強く動かしたい感情を1つ］ | ［projectBrief / Evidence ID］ | ［status］ |
| shortestRepeatableLoop | ［開始状態 → action / decision → response → reward → 次の開始状態となる最短1周］ | ［build / playtest Evidence ID］ | ［declared / implemented / observed / contradicted / missing］ |
| playerDecision / systemResponse | ［判断と応答］ | ［Evidence ID］ | ［status］ |
| rewardMechanisms | ［family / form / before → action → response → after / perceived reward / amplifier］ | ［Evidence ID］ | ［declared / observed / contradicted / missing］ |
| oneSentencePromise | ［1文で理解できる約束］ | ［理解test Evidence ID］ | ［status］ |
| coreProofMoment | ［theme固有のaction → response → rewardが最短で見えるscene / state / interaction］ | ［asset / build / third-party Evidence ID］ | ［declared / implemented / observed / contradicted / missing］ |
| Known Frame / source action → response → reward / Meaningful Difference | ［理解しやすい型、source loop仮説、target体験を変える差分］ | ［source Evidence ID / missing］ | ［declared / observed / inferred / missing］ |

### Concept Origin Route

起点が未入力なら内容から推測せず、`origin-not-declared`と次の確認質問を残します。field充足はfunやqualityの合格ではありません。

| Origin | Starting point | Missing counterpart | Next concrete question | Status |
|---|---|---|---|---|
| ［`theme-first / system-first / holistic-image / imitation / not-declared`］ | ［宣言された出発点］ | ［theme / system / mechanism / difference等］ | ［action → response → rewardへ具体化する質問］ | ［needs-counterpart / declared-route-ready-for-validation］ |

### Reward Mechanism Trace

| Reward family | Reward form | Before state | Player action | System response | After state / perceived reward | Amplifier | Evidence / status |
|---|---|---|---|---|---|---|---|
| ［sensory / mastery / discovery / agency / attachment / aesthetic-emotion］ | ［`inherent / transition / mixed`］ | ［開始状態・感情］ | ［action / decision］ | ［feedback・状態変化］ | ［結果状態とreward仮説］ | ［音、animation、timing等］ | ［declared / observed / contradicted / missing］ |

effect、coin、level-up UIはresponse / amplifierとして記録し、それだけでplayerが報酬を感じた証拠にしません。

### Moment-to-Moment Experience Loop

feature数ではなく、`primaryIntendedFeeling`が`shortestRepeatableLoop`の中でどう動くかを時系列で記録します。各beatを埋めただけでfunをobservedにせず、build観測とhuman reportを分離します。

- Primary intended feeling: ［最も強く残したい感情を1つ。複数なら優先順位を決める］
- Shortest loop boundary: ［開始状態、終了 / reset状態、想定時間。macro progressionではなく最短反復］
- First-glance protocol: ［実表示条件と露出時間。3-second testを使う場合も宣言した条件であり、普遍的な合格秒数ではない］

| Beat | Player state / intended feeling | Observable cue | Action / decision | System response | Reward / emotional change | Build / human evidence and status |
|---|---|---|---|---|---|---|
| anticipation | ［次の脅威・機会を読み、緊張や期待が生まれる状態］ | ［説明なしで読めるcue / missing］ | ［何を見て迷うか］ | ［まだ確定前の予告］ | ［期待する感情］ | ［declared / observed / contradicted / missing + Evidence ID］ |
| commit | ［選択を引き受ける状態］ | ［affordance / resource / risk］ | ［温存か使用か等のmeaningful decision］ | ［入力受理と即時feedback］ | ［agency / tension］ | ［status / Evidence ID］ |
| resolution | ［結果を読む状態］ | ［target、cause、impact］ | ［結果の確認または追加入力］ | ［成功・失敗、音・光・motion等のamplifier］ | ［爽快、達成、理解、落胆等］ | ［status / human felt reward］ |
| recovery / reset | ［次の一手へ戻る状態］ | ［変化した盤面、次目標、retry cue］ | ［再挑戦、build変更、次の選択］ | ［failure recoveryまたはloop reset］ | ［納得、学習、もう一回の期待］ | ［status / wouldRepeat reason］ |

| Pacing check | Design hypothesis | Build observation | Human evidence | Status / next test |
|---|---|---|---|---|
| first-glance action | ［説明なしで最初の意味ある入力が読めるか］ | ［time to first meaningful action / help参照］ | ［unaided summary / confusion］ | ［status］ |
| decision tension | ［作業ではなく何を迷うか］ | ［resource、risk、timingのtradeoff］ | ［選択理由］ | ［status］ |
| difficulty ramp | ［少しずつ増える新しい要求］ | ［enemy / speed / combinationと到達順］ | ［overwhelmed / bored / near-failure］ | ［status］ |
| fair failure | ［失敗前のtelegraph、利用可能なcounterplay、結果後の原因］ | ［failure → retry log］ | ［self-attributed / unfair / unclearと理由］ | ［status］ |
| success amplification | ［成功を何で明瞭に褒めるか］ | ［sound / light / motion / state change］ | ［felt reward］ | ［status］ |
| novelty cadence | ［coreを壊さず、いつ何が新しくなるか］ | ［新敵、rule、combo、contextの投入順］ | ［surprise / fatigue / confusion］ | ［status］ |
| replay pull | ［終了時に何をもう一度試したくなるか］ | ［未完の目標、next build、自己ベスト等］ | ［wouldRepeatとparticipant自身の理由］ | ［status］ |
| subtraction candidate | ［primary feelingと最短loopに寄与しない要素］ | ［削除しても成立するfeature / presentation］ | ［理解・rewardへの影響］ | ［keep / simplify / remove / test］ |
| creator self-play boundary | ［作者が感じた引っかかり］ | ［再現step / maker friction log］ | ［別のhuman player evidence / missing］ | ［作者の感触をtarget playerの唯一の正解にしない］ |

### Mechanism Transfer Map

`conceptOrigin=imitation`、Known Frame、またはcompetition分析を使う場合に作ります。適用外ならN/A理由を記録します。

- projectBrief mechanismTransfer status: ［not-required-from-brief / source-mechanism-missing / source-frame-missing / target-adaptation-missing / declared-transfer-ready-for-validation］

| Source / Evidence | Surface feature | Source action → response → reward | Transferable mechanism | Target adaptation | Target proof / status |
|---|---|---|---|---|---|
| ［作品 / Evidence ID］ | ［camera、敵数、UI等］ | ［sourceで観測した構造 / proxy境界］ | ［themeを外して残るdecision、tension、feedback等］ | ［targetで変えるaction / decision / response / reward］ | ［prototype moment / missing］ |

### Core Legibility Gate

5問を合計scoreにせず、別々のstatusと根拠で記録します。説明できたことをfunの実測へ変換しません。

| Check | Current hypothesis | Third-party / Build observation | Evidence | Status |
|---|---|---|---|---|
| theme-specific play | ［themeだから生まれるaction / system］ | ［unaided teach-back / missing］ | ［Evidence ID］ | ［declared / observed / contradicted / missing］ |
| theme-system fit | ［themeとsystemが互いを強める理由］ | ［build moment / missing］ | ［Evidence ID］ | ［status］ |
| experience → reward | ［action → response → reward］ | ［playtest observation / missing］ | ［Evidence ID］ | ［status］ |
| one-sentence teach-back | ［oneSentencePromise］ | ［participantの自発要約。誘導質問への同意は不可］ | ［Evidence ID］ | ［status］ |
| core proof moment | ［coreProofMoment］ | ［asset / buildでの位置、追加説明なしのunaided response］ | ［Evidence ID］ | ［declared / implemented / observed / contradicted / missing］ |

### Core Revision Ledger

親revisionがない初回はinitialと明記します。再検証では必須の`parentStimulusId`、`changeSummary`、`changedVariables`、`invariantsKept`を転記し、複数変数を同時変更した場合は改善原因を一つへ帰属しません。単一変更でもprotocol equivalenceが未確認なら因果は証明済みにしません。

| Brief / Stimulus / Build revision | Observed issue | Variable changed | Invariants kept | Evidence / Retest | Outcome |
|---|---|---|---|---|---|
| ［revision IDs］ | ［問題］ | ［theme / system / experience / reward / presentation］ | ［固定条件］ | ［artifact / protocol］ | ［resolved / changed / unresolved］ |

### First-contact Asset Readiness

`firstContactTest`がない場合は`untested`と必要なasset / context / participant条件を記録します。ある場合は`firstContactTestEvidence.resultHandle`でexact-saveしたmanual intel pathをEvidence Indexへ入れ、bounded sampleの件数をreadiness scoreやconversionへ変換しません。

- Evidence ID / artifact path: ［firstContactTestEvidence.resultHandleでexact-saveしたmanual intel］
- Asset / revision: ［assetId / parentAssetId / changeSummary / changedVariables / invariantsKept］
- Exposure context: ［device / viewport / duration / sound / order］
- Recruitment / questions / deviations: ［条件］
- Diagnostic candidates: ［原因ではないinspection priority］
- Visual-quality counts: ［credible / rough / style-mismatch / unclear / not-assessed。客観的制作品質scoreではない］
- Theme legibility / appeal: ［understoodThemeとthemeAppealを別集計。理解できたことを好みへ変換しない］
- Try intent: ［yes / maybe / no / not-askedとparticipant自身の理由。purchase、需要、conversionではない］
- Missing reject reasons: ［`unexplainedImmediateRejectCount`。他回答から推測しない］

| Asset / Context | Exposure condition | Perceived visual quality | Visible theme | Theme appeal | Imagined action | Imagined reward | Try intent | Immediate reject risk | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| ［capsule / key visual / 第一viewport / screenshots / trailer / demo］ | ［device / viewport / duration / sound / order］ | ［credible / rough / style-mismatch / unclear / not-assessed + reason］ | ［観測］ | ［yes / no / unclear / not-assessed + reason］ | ［unaided response］ | ［unaided response］ | ［yes / maybe / no / not-asked + reason］ | ［Not for me / unreadable / wrong expectation］ | ［Evidence ID］ | ［core-visible / theme-only / system-only / unreadable / untested］ |

「最初の4枚」や「30秒」を固定条件にせず、現在の実表示でcoreのproof momentがいつ現れるかを記録します。生成AIや自動化で作ったassetもhuman responseの代用にはしません。

### Concept Test Trace

`conceptTest`がない場合はmissing理由と次に必要なstimulus / participant条件を記録します。ある場合もsample内の件数だけを示し、固定合格率、母集団比率、conversion、purchase予測へ変換しません。個人情報は記載せず、仮名の`participantId`または集計だけを使います。schemaの自動検出はemail形式に限られるため、その他の個人情報は保存前に除去します。

- Evidence ID / artifact path: ［conceptTestEvidence.resultHandleでexact-saveしたmanual intel］
- Tested at / stimulusId: ［ISO日時 / ID］
- Parent stimulus / change design: ［parentStimulusId / changeSummary / changedVariables / invariantsKept、またはinitial］
- Brief revision / revision match: ［projectBriefRevision / matched・mismatched・unlinked・not-supplied］
- Promise shown / exact match: ［実際の提示文 / matched・mismatched・unlinked・not-supplied。完全一致はprovenanceでありquality scoreではない］
- Stimulus / exposure protocol: ［何を、何秒、どの順序で見せたか］
- Recruitment / target player definition: ［募集元、target fitの判定基準］
- Questions asked: ［誘導を避けた質問］
- Deviations / limitations: ［順序、moderation、言語、sample boundary］
- Teach-back audit: ［summaryProvidedCount / understandingMarkedYesWithoutSummaryCount / coreDimensionsMarkedYesWithSummaryCount。yes判定だけを自発説明にしない］
- Revision candidates: ［`conceptTestDiagnostics.revisionLoop.candidateReviewAreas`。原因ではなくinspection priority］

| Observation | Counts | Confusions / unaided summary | Interpretation limit |
|---|---|---|---|
| understoodTheme | ［yes / no / unclear / not-measured］ | ［どのtheme / worldと読んだか］ | theme認識をsystem fitや好みへ変換しない |
| themeSystemFit | ［yes / no / unclear / not-measured］ | ［participant自身のthemeSystemFitReason］ | themeとactionの個別理解からfitを推測しない |
| understoodAction | ［yes / no / unclear / not-measured］ | ［反復行動の理解 / 混乱］ | action理解だけをfunや需要にしない |
| understoodReward | ［yes / no / unclear / not-measured］ | ［報酬の理解 / 混乱］ | reward理解をaction理解で補完しない |
| interest | ［would-play / maybe / would-not-play / not-asked］ | ［理由 / 未質問］ | purchaseや継続の証明ではない |

### Promise-Delivery Trace

| Promise claim | Promise asset / Evidence ID | Intended build moment | Delivered evidence | Match status | Decision impact |
|---|---|---|---|---|---|
| ［購入前に約束する体験］ | ［capsule / trailer / copy］ | ［build / task / state］ | ［playtest / telemetry / missing］ | ［matched / overpromised / under-signaled / missing］ | ［施策］ |

### Delivered Experience Playtest Trace

- Exact-save evidence: ［`playtestSessionEvidence.resultHandle`で保存したmanual intel path / missing理由］
- Session boundary: ［session ID、build、task、start/end state、executionEnvironment（OS、device、runtime、renderer backend / implementation、hardware / software acceleration、viewport / DPR）、controls、duration、tester type、prior knowledge］
- Protocol alignment / deviations: ［build / task / controlsのmatched・mismatched・not-supplied、deviation］
- Retest lineage: ［sessionId / parentSessionId / changeSummary / changedVariables / invariantsKept / parent artifact、またはinitial］
- Retest comparability: ［parentとcurrentのtask、executionEnvironment、controls、start state、tester / cohort、observation sourceの差。1変数でもcausal proofではない］
- Renderer generalization boundary: ［software rendererならそのcompatibility pathだけ。hardware player性能へ一般化しない。hardwareでも記録したdevice / runtime / renderer / viewportだけ］
- Human report boundary: ［humanReportのfelt reward / repeat intent / confusion、またはAI-operatedなのでN/A］

| Step / time | Player intent | Input / Action | System response | Friction | rewardSignal | Evidence ID |
|---|---|---|---|---|---|---|
| ［step / 秒］ | ［目的］ | ［入力］ | ［画面・音・状態変化］ | ［none / minor / material / blocker］ | ［demonstrated / not-observed / unclear / not-assessed］ | ［capture / video / log］ |

この表はone bounded sessionの記述であり、fun score、completion rate、retention、需要を推定しません。

### Playtest Cohort Summary

- Exact-save evidence: ［`playtestCohortEvidence.resultHandle`で保存したmanual intel path / missing理由］
- Cohort boundary: ［cohort ID、purpose、recruitment、target player、sampling boundary、observation window］
- Exposure counts: ［sessionCount、uniqueHumanParticipantCount、repeatHumanParticipantCount］
- Evidence separation: ［human / AI、human-report-present / missing / AI N/Aを別々に記録］
- Protocol groups: ［build、task、executionEnvironment、controls、observation sourceごとのsession件数］
- Lineage: ［linked retest、internal parent、external parent、multi-variable retestの件数］
- Candidate review areas: ［原因や順位ではなく、session IDへ戻って調べる項目］

| Evidence dimension | Session / observation counts | Missing / variation | Interpretation limit |
|---|---|---|---|
| Outcome | ［completed / failed / blocked / stopped］ | ［stop reason coverage］ | completion rateへ変換しない |
| Friction | ［minor / material / blockerを含むsession件数］ | ［protocol差］ | severity件数を人口比率にしない |
| Reward evidence | ［demonstrated / not-observed / unclear / unassessed-only session件数］ | ［human report coverage］ | fun、retention、需要へ変換しない |

cohort集計はboundedな問題発見用です。同じparticipantの再参加を独立sampleにせず、AIとhumanを平均せず、後付けthresholdでpass / failを作りません。

#### Retest Comparison Trace

| Current session | Parent session / artifact | Declared change | Recorded protocol mismatches | Participant exposure | Evidence transition | Comparison status / unresolved reasons |
|---|---|---|---|---|---|---|
| ［session ID］ | ［parent ID、exact-readback済みpath / pending理由］ | ［change summary、changed variables、declared invariants］ | ［task / executionEnvironment / controls / start state / tester type / observation source / prior knowledge］ | ［different / repeat human、AI pair、mixed］ | ［outcome、reward signals、material/blocker friction、human felt rewardのparent → current］ | ［comparison-candidate-only / unresolved、理由］ |

`evidenceTransition`は2つのbounded sessionの記述差です。別participantの感想を同一playerの変化として扱わず、protocol一致や1変数変更だけから因果効果、改善率、fun、retentionを生成しません。

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

### Capability Reinvestment Gate

売上再投資、外注、採用、online、story、live operationsなどのscope拡張は一般論で勧めず、現在のplayer-facing bottleneckとproject固有のcapacity / runwayで判定します。複数案を平均せず、現時点の決定を1行だけ記録します。

| Decision | Bottleneck | Evidence ID | Capacity / runway boundary | Reversible next step | Expansion trigger |
|---|---|---|---|---|---|
| ［learn / simplify / outsource / hire / defer / not-applicable］ | ［player / asset evidenceで確認した現在の制約］ | ［E-###］ | ［予算、担当、運用費、runway / missing］ | ［固定契約前の小さく戻せる検証］ | ［どの証拠が揃えばscopeを拡張するか］ |

### Repair Backlog

capture failure、receipt不整合、crash、liveness failure、計測不能など、次のplayer / market仮説を検証する前提を直す作業を記録します。修復は実験と分離し、仮説が支持されたoutcomeとして数えません。
修復対象が0件ならcanonical headerとseparatorだけを残し、data rowは空にします。

| Priority | Blocking failure | Evidence ID | Owner surface | Success gate | Must not change |
|---|---|---|---|---|---|
| 1 | ［再現可能なfailure］ | ［E-###］ | ［capture / runtime / build / instrumentation］ | ［同一条件で機械判定できる復旧条件］ | ［弱めてはいけないcontract / invariant］ |

### Experiment Queue

最大3件に絞り、修復後に初めて検証できるplayer / asset / market仮説だけを置きます。修復作業や単なる証拠取得を実験として扱いません。

| Priority | Hypothesis | Stage | Primary metric | Source | Guardrail | Smallest build / asset | Experiment ID |
|---|---|---|---|---|---|---|---|
| 1 | ［検証可能な仮説］ | ［gate］ | ［1件］ | ［human-playtest / telemetry等］ | ［悪化停止条件］ | ［最小変更］ | ［prospective ID / not registered］ |

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

## Player Simulation Cards

保存済みの同一v2 personaを各scenarioへ通し、exact-saveしたderivation memoryと明示的な`stimulusEvidenceRefs`を混同せずに記録します。AIが予測した感情や継続判断はhuman reportではなく、反証可能な仮説です。

| Persona | Scenario | Exposure | Derivation memory | Explicit stimuli | Review voice | Perception | Decision / reason | Predicted response | Continue? | Confidence / unknown | Human falsifier |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ［persona ID］ | ［current / proposal］ | ［scenario-only / visual-evidence / ai-operated］ | ［derivation Evidence ID］ | ［capture / session Evidence IDs、またはnone］ | ［source_appid / recommendation_id］ | ［期待、気づいた信号、不明な信号］ | ［次の行動 / 理由］ | ［before → after予測感情、摩擦、報酬信号］ | ［continue / stop / uncertain と理由］ | ［高/中/低、未観測事項］ | ［人間への無誘導質問 / 観測signal］ |

`change`ではpersona、task、evidence classをcurrent / proposal間で固定します。persona間の一致数を市場構成比にせず、競合reviewの反応と対象UIへの今回の反応を別々に追跡します。

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

各findingには次のseverity行を必ず付けます。

- Severity: ［`Blocker` / `Important` / `Suggestion`］

以下の各項目は、`baseline` では現状だけ、`change` では現状 vs 変更案を記入します。Selected Domains の選択外なら、所見を作らず、冒頭と同じ明示的な N/A 理由だけを記録します。

### ゲームプレイ

- Status: ［Selected / N/A と理由］
- Mode result: ［プレイヤーから観測できるコアループ、目標、入力→反応、進行、失敗→再挑戦、継続動機 / change の場合は現状 vs 変更案］
- Playtest protocol: ［build ID、player task、start state、end state、executionEnvironment、controls、duration、tester prior knowledge / 未実施ならmissing理由］
- Playtest observations: ［time to first meaningful action、task completion、Action → response → rewardSignal、誤入力、feedback、failure → retry、次目標の認識とEvidence ID］
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
- 根拠: ［`steam_brief` / `steam_search` / `steam_fetch` / `steam_timeline` / `steam_reviews` の Evidence ID。なければ「根拠不足」］

competitionがSelectedの場合だけ`competitor-selection.md`に従い、次の3 metadata lineと3〜8行のcanonical tableを残します。未選択ならledgerを作らず、StatusのN/A理由だけを記録します。must-match axesとcandidate routesはsemicolonで区切ります。

- Competitor freshness window: ［24 months from YYYY-MM-DD］
- Competitor must-match axes: ［core input; repeated action; purchase reason］
- Competitor candidate routes: ［steam-discover; known-name］

#### Competitor Selection Ledger

| Appid | Game | Fit role | Market role | Release stage | Released at | Freshness | Core-loop / purchase-reason evidence | Review signal | Scale / momentum signal | Evidence IDs | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ［appid］ | ［game］ | ［direct-competitor / adjacent-competitor / system-reference / visual-reference / rejected-candidate］ | ［recent-success / breakout-anchor / comparison-control / unproven / not-assessed］ | ［demo / early-access / released / upcoming / unknown］ | ［YYYY-MM-DD / upcoming / unknown］ | ［current-window / historical / upcoming / unknown］ | ［対象と重なるloopまたはpurchase reason。tag一致だけにしない］ | ［件数、positive率、window / missing］ | ［CCU、recent activity、owners推定等とsource semantics / missing］ | ［E-###］ | ［include / exclude］ |

includeにはdirect / adjacentを1件以上、recent-success / breakout-anchorを1件以上含め、comparison-controlまたはrejected-candidateも1件以上残します。高評価率だけを成功判定にせず、成功roleではReview signalとScale / momentum signalの両方を要求します。古い大ヒットはrecent-successではなくbreakout-anchorとして扱います。

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
Coverage rateとDirect observation rateは、serverと同じ丸めによる小数1桁の%表記（例: `0.0%`、`66.7%`）で記録します。

| Domain | Dimension | Status | Evidence IDs | Limitation / mismatch | Decision impact |
|---|---|---|---|---|---|
| ［domain］ | ［固定dimension］ | ［status］ | ［ID / なし］ | ［観測範囲・不一致］ | ［confidence・勧告への影響］ |

| Scope | Applicable dimensions | Observed | Reported-zero | Estimated | Missing | Coverage rate | Direct observation rate |
|---|---|---|---|---|---|---|---|
| ［Selected Domain］ | ［N/Aを除く固定dimension数］ | ［件数］ | ［件数］ | ［件数］ | ［件数］ | ［`(observed + reported-zero + estimated) / applicable dimensions`］ | ［`(observed + reported-zero) / applicable dimensions`］ |
| overall | ［全Selected Domain合計］ | ［件数］ | ［件数］ | ［件数］ | ［件数］ | ［同式］ | ［同式］ |

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
