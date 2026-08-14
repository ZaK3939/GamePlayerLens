# 辛口批評家 rubric

目的は文章を厳しく見せることではなく、意思決定に耐えるまで弱い根拠と自己都合の解釈を落とすことです。合格は、選択された領域に対するすべてのゲートを満たした場合だけです。

## 1. スコープと Mode ゲート

- レポート冒頭に Mode、Selected Domains、領域ごとの選択理由または明示的な N/A 理由がなければ差し戻す。
- `baseline` は現状だけを評価する。変更案を仮定したり、現状 vs 変更案の表を出したりしない。
- `change` は同じ評価軸と根拠で現状 vs 変更案を比較する。変更案だけの単独評価は差し戻す。
- Selected Domains の選択外にある領域は N/A とし、根拠未取得や未評価を不合格理由にしない。

## 2. 根拠ゲート

- 根拠なし主張が1つでもあれば差し戻し。
- 事実主張には tool 取得値、保存済み artifact、または追跡可能な persona voice を付ける。
- Evidence Index の各項目に `artifact repository-relative path`、`observedAt`、`source` がなければ差し戻す。
- tool返り値に `meta.resultHandle` があるのに、それを使わずpayloadをモデルが再serialize、統合、抜粋、要約した場合は差し戻す。保存artifactはwarningとmetaを含むtool出力原本と一致させる。
- 推論は事実と分け、「この根拠からの推論」と明記する。
- データが欠けた箇所を平均値や一般論で埋めない。「根拠不足」とし、必要な取得条件を指定する。
- `observed`（source が観測時点の実値を返した通常値）、`reported-zero`（source が 0 を明示）、`missing`（未取得または欠損）、`estimated`（推定）を区別する。observed から履歴や将来値を推測せず、missing を 0 で補完せず、estimated には方法と caveat を付ける。
- SteamSpy `owners` は所有数の推定範囲であり、売上本数ではない。売上、販売速度、成長を断定する根拠に使わない。
- SteamSpy `average_forever=0` は、原値を reported-zero として残した上で、欠損相当とした解釈と warning を記録する。CCU=0 は有効な観測時点の値として保持する。
- `evidence-coverage.md`の固定dimensionをSelected Domainごとに埋め、Coverage rateとDirect observation rateを分ける。取得失敗をN/Aへ変えた場合、estimatedを直接観測へ数えた場合、blocking missingを平均coverageで隠した場合は差し戻す。
- 更新施策を勧告する場合は`update-strategy.md`を読み、Decision Card、Update inventory、Persona Update Impact Matrix、Prioritized Update Backlogを要求する。`steam_updates`の`patchnotes` tagとheuristic分類を混同した場合、取得windowやunderfilled warningを落とした場合は差し戻す。
- 更新頻度、最終announcement日、競合precedentから、品質、開発速度、放置、売上、retention効果を断定した場合は差し戻す。対象ゲームのplayer problem根拠と、update後に観測するsuccess signal / guardrailがなければ`fix-now`にしない。
- persona v2の`update_reaction`がreviewで直接観測されたのか、dealbreaker等から推論したのか、unknownなのかを区別しない場合は差し戻す。polarity-balanced persona件数をaffected player shareに変換しない。

## 3. ゲームプレイ・ストア訴求・ローカライズ品質ゲート

- タグ（tags）やcategoriesだけからゲームロジック、内部状態遷移、バランス実装を断定した場合は差し戻す。description、tags、categories、reviewsはプレイヤー知覚のproxyであり、内部ロジックの評価には仕様、build、動画、telemetry、playtestの直接根拠を要求する。
- gameplayを選択し操作可能なbuildがある場合は`playtest.md`に従い、build ID、player task、start/end state、controls、時間上限、Action → responseの時系列logを要求する。ページを閲覧しただけでtest playと呼んだ場合、AI 1 testerを人間のfun、completion rate、retentionの代表とした場合は差し戻す。
- `playtestSession`入力を`playtestSessionEvidence.resultHandle`でexact-saveしない場合、Action / system response / friction / rewardSignalを一つのscoreへ統合した場合、AI-operated sessionへ`humanReport`を補完した場合、またはone sessionからfun、completion rate、retention、需要を断定した場合は差し戻す。
- `executionEnvironment`にOS、device、runtime、renderer backend / implementation、hardware / software acceleration、viewport / DPRがないsessionは差し戻す。software rendererの結果をhardware player環境へ一般化した場合、またはrenderer条件が違うretestを同一protocolとした場合も差し戻す。
- playtest retestで`parentSessionId`、`changeSummary`、`changedVariables`、`invariantsKept`が揃わない場合、exact-save済みparentを読まず自己申告の維持条件だけで比較した場合、または複数変更・protocol / cohort差がある結果を一つの原因へ帰属した場合は差し戻す。
- `playtestCohort`をexact-saveしない場合、重複session ID・lineage循環・観測後でないassembledAtを受理した場合、AIとhumanを統合した場合、repeat participantを独立sampleへ数えた場合、またはboundedな件数からcompletion / fun / retention / 需要の率や固定pass thresholdを作った場合は差し戻す。
- cohort内retestのrecorded protocol mismatch、participant exposure、複数変更、external parent未取得を無視した場合、または`evidenceTransition`の前後差をそのまま変更の因果効果と呼んだ場合は差し戻す。
- ストア訴求を選択した場合は、`localizedStorefronts`のcopy、screenshotsまたはcapture、競合の同種根拠、レビュー上の期待差を分けて示す。deep linkを貼っただけでリンク先の内容を取得済み根拠にしない。
- 対応言語一覧だけから翻訳品質、文化適合、フォント可読性を断定した場合は差し戻す。requested localeのstore copy、対象言語レビュー、またはゲーム内captureの少なくとも1つを要求し、Steam fallbackの可能性を明記する。`matchesEnglishCopy=true` は正規化後の完全一致だけを示し、fallbackの理由や翻訳品質の証明として扱わない。`matchesEnglishCopy=false` も非一致だけを示し、fallbackでない、意図した言語が返った、翻訳済みと断定しない。

## 4. Indie survival strategyゲート

- concept、prototype、store公開、demo、Next Fest、launch、post-launch、studio survivalを扱う場合は`indie-survival-strategy.md`を読む。Indie Strategy Card、Core Experience Map、Concept Origin Route、Reward Mechanism Trace、Core Legibility Gate、Core Revision Ledger、First-contact Asset Readiness、Promise-Delivery Trace、Funnel Health、Milestone Readiness、Capability Reinvestment Gate、Repair Backlog、Experiment Queue、Survival Scenariosがなければ差し戻す。imitation / Known Frame / competition分析ではMechanism Transfer Mapも要求し、適用外ならtopicに対応したN/A理由を要求する。
- crash、capture failure、receipt不整合、liveness failure、instrumentation欠損をplayer / market仮説のExperiment Queueへ混ぜた場合は差し戻す。既知failureの修復はEvidence ID、success gate、維持contractを持つRepair Backlogへ分離する。Experiment Queueが3件を超える場合、sourceがない場合、または修復成功をfun・需要・品質改善のOutcomeにした場合も差し戻す。
- `Appeal Promise`と`Delivered Experience`を分離し、購入前のasset evidenceと購入後のbuild / playtest evidenceを別にする。購入前と購入後を単一score、掛け算、平均で相殺した場合は差し戻す。
- wishlistを面白さ、販売本数、algorithmic visibilityの単独原因または証明とした場合は差し戻す。impression、store visit、cohort、window、asset、price expectationを確認する。
- 販売本数、platform fee、refund、税率、conversion、開発期間を普遍的な固定値としてprojectへ当てはめた場合は差し戻す。契約、法域、地域、scope、team capacity、runwayをassumptionとobservedへ分ける。
- Next Festのeligibility、日程、参加回数を記憶や古い資料で断定せず、公式Steamworksの現在のdocumentationを確認する。確認日とURLがなければmilestoneをpassにしない。
- AI playtestをhuman playtestのfun、需要、completion、retentionの代表にしない。操作可能性や再現できるfrictionの観測と、人間participantのresponseを分ける。
- `projectBrief`のdeclared design intentを、そのままplayer evidence、市場需要、体験実装済みの証明にした場合は差し戻す。promise、build moment、third-party responseのprovenanceを分ける。
- `projectBriefDiagnostics`のfield数やmissing数をquality score、面白さ、readiness passへ変換した場合は差し戻す。これは入力inventoryであり、fieldの中身や外部検証の質を採点しない。
- 開発中対象の入力を`ready`とする前に、`targetPlayer`、route固有のtheme / system / reward、`oneSentencePromise`、`coreProofMoment`が揃っているか確認する。`coreProofMoment`を宣言しただけで実装済み、assetで可視、第三者に理解済みのいずれかへ昇格した場合は差し戻す。
- `conceptOrigin`を内容から推測した場合、またはConcept Origin Routeで起点に対する不足counterpartを示さず実装・asset制作へ進めた場合は差し戻す。`theme-first / system-first / holistic-image / imitation`は優劣やmaturityのscoreではない。
- Reward Mechanism Traceでreward名や派手なeffectだけを示し、`inherent / transition`、before state、player action、system response、after state、amplifier、観測statusを分けない場合は差し戻す。responseやamplifierをplayerがrewardを感じた直接証拠にしない。
- imitation / Known Frame / competition分析で表層featureだけを列挙し、sourceのaction → response → reward、transferable mechanism、target adaptation、proof momentをMechanism Transfer Mapへ分けない場合は差し戻す。sourceを直接確認していないproxyから内部loopを断定した場合も差し戻す。
- imitation / Known Frameの`projectBrief`で`sourceAction`、`sourceSystemResponse`、`sourceReward`の欠落を表層featureやgenre知識から補完した場合は差し戻す。3 fieldはdeclared hypothesisであり、すべて入力済みでもsource evidenceやplayer rewardの観測済み証拠へ昇格させない。
- `conceptTest`のparticipant countや`interest`から固定thresholdを作り、milestone pass、conversion、purchase、需要を断定した場合は差し戻す。`understoodTheme`、`themeSystemFit`、`understoodAction`、`understoodReward`、`interest`を別々に示し、stimulus、募集、質問、deviation、bounded sampleの限界を要求する。theme認識とaction理解からtheme-system fitを推測した場合、または`no / unclear`の理由をparticipant以外の回答から補完した場合も差し戻す。
- `understoodTheme=yes`、`themeSystemFit=yes`、`understoodAction=yes`、`understoodReward=yes`のいずれかを、対応する`unaidedSummary`なしで第三者のteach-backが成功した証拠にした場合は差し戻す。`teachBackAudit.understandingMarkedYesWithoutSummaryCount`をmissing evidenceとして残す。
- concept test入力を`conceptTestEvidence.resultHandle`でexact-saveせずモデルがpayloadを転記・要約した場合、brief revision / promiseのmismatched・unlinkedを隠した場合、または完全一致を意味理解や品質scoreへ変換した場合は差し戻す。
- concept testの`participantId`が仮名でない場合、または氏名、email、連絡先などの個人情報をevaluationやartifactへ含めた場合は差し戻す。
- oneSentencePromiseが短い、またはcoreProofMomentが宣言済みという理由だけでCore Legibility Gateをpassにしない。theme-specific play、theme-system fit、experience → reward、unaided teach-back、asset / build上のcore proof momentを別々に示さない場合、「分かりましたか」への同意をunaided理解とした場合、奇抜な題材だけを触りたくなるcoreとした場合は差し戻す。
- revised concept testで`parentStimulusId`、`changeSummary`、`changedVariables`、`invariantsKept`を保存しない場合、Core Revision Ledgerに変えた変数と維持条件がない場合、または一度に複数変更した結果を一つの原因へ因果帰属した場合は差し戻す。単一変更の自己申告だけでprotocol equivalenceや因果を証明した場合も差し戻す。
- 第一viewport、最初に見えるscreenshots、trailer / microtrailer、demo entryを実表示contextで確認せず、copyや制作者説明だけでFirst-contact Asset Readinessをpassにしない。AIがassetを生成・分析できたことを、人間のfun、taste fit、visual trustの証明とした場合は差し戻す。
- `firstContactTest`入力を`firstContactTestEvidence.resultHandle`でexact-saveしない場合、visual quality / theme / action / reward / immediateRejectを一つのscoreへ統合した場合、`rough / style-mismatch`の理由を記録しない場合、`immediateReject=yes`の未記録理由を他回答から推測した場合、またはbounded sampleから客観的制作品質、conversion、需要、readiness passを断定した場合は差し戻す。
- first-contactで`understoodTheme`、`themeAppeal`、`tryIntent`を分けず、理解できたthemeを好みや試遊意向と混同した場合は差し戻す。negative / unclearのparticipant reasonを他回答から補完せず、try intentをpurchase、需要、conversionへ変換しない。
- `outsource`または`hire`を勧めるのにproject固有のrunway、支払・受入capacity、現在のbottleneckを示すEvidence ID、reversibleな最小契約、expansion triggerがない場合は差し戻す。online、story、live operations等を追加する場合も、core rewardへの寄与と開発・運用依存がなければ差し戻す。
- 「最初の4枚」「30秒PV」をcurrent surfaceやtarget playerに関係なく固定条件にした場合は差し戻す。asset countやdurationではなく、theme、action、rewardのunaided legibilityとproof momentを要求する。

## 5. UI 品質ゲート

- UI 品質ゲートは、Selected Domains で `ui` が選択された場合だけ適用する。UI が選択外なら明示的な理由とともに N/A とし、画像やブラインド比較がないことを不合格理由にしない。
- `ui` が選択された場合は、対象 UI と、指定された `qualityTier` と同等の出荷済み製品の UI を匿名化したブラインド比較にかける。qualityTier が未指定なら、比較基準を仮定せず確認する。
- 比較前に具体的なbenchmark taskを固定し、同じscreen state、platform、controls、近い情報量の出荷済みreferenceを2〜4本揃える。Game UI DatabaseやInterface In Gameの掲載・人気だけでcohortを選ばず、source URL、accessedAt、game、screen state、capture IDを保存したprovenance artifactがないreferenceは差し戻す。
- 評価者は正解開示前に、階層、可読性、密度、状態表現、入力フィードバック、一貫性の判定を固定する。
- referenceを選んだ同じmodelがgame名や対応表を記憶したまま評価したのにblind comparisonと称した場合は差し戻す。memoryを隔離できないclientでは `non-blind structured comparison` とし、confidenceをhighにしない。
- 正解開示後に `ui-quality-gap.md` の0〜4 anchorでreference中央値と `gap = target - median` を軸別に示す。unscoredを0にした場合、単一の美観総合点だけで実力差を断定した場合、人気・売上・ブランド知名度をUI品質へ変換した場合は差し戻す。
- static screenshotしかないのにmotion、latency、controller feel、未表示のhover / focus / disabled / loading / errorを採点した場合は差し戻す。video、連続capture、または実操作証拠がなければunscoredとする。
- 単なる装飾追加を修正とせず、負けた評価軸とスクリーンショット上の位置を修正指示にする。
- UI が選択されているのに比較画像を取得できない場合は合格にせず、手動配置先を示して「根拠不足」とする。

## 6. Persona voice ゲート

- persona の発言が `voice[].text` と矛盾する場合は差し戻し。
- 発言の根拠に `source_appid` または `recommendation_id` が欠落していれば差し戻し。language と voted_up も照合する。
- polarity-balanced persona sample は `representative: false` である。positive/negative の構成を `population ratio` や市場母集団の好評率として使った場合は差し戻す。
- 1件の強いレビューを市場全体の意見として一般化しない。反対極性と別 Flow の根拠も確認する。

## 7. Flow Size ゲート

- Flow Size を大 / 中 / 小または数値で示す場合は、母集団の `reviewStats`、SteamSpy `owners` の推定 caveat、市場規模や需要に関する外部根拠を確認する。いずれかが欠けるなら数量断定を差し戻す。
- balanced sample の件数比、個別 persona の強さ、現在 CCU のいずれか単独から Flow Size を推定しない。

## 8. 領域整合ゲート

- Selected Domains の各担当が、同じ対象仕様と、change の場合は同じ変更案を評価していること。
- ある領域の改善が別領域の Friction を増やす場合、Overall Assessment に反映すること。
- 現在 CCU は取得時点のスナップショットとして扱い、過去トレンドや因果を捏造しないこと。
- Final Recommendation に、勧告、根拠と結びついた `confidence`、および実行可能な `next validation` がなければ差し戻す。

## 9. 再現性と calibration ゲート

- 最終 evaluation の保存後に、同じ `save_artifact` の kind=`run` で immutable な run artifact を保存できない場合は完了として扱わない。
- run artifact に Mode と全 scenario、Selected Domains、使用した persona ID、全 independent pass の連続した rounds、warning、最終 evaluation 参照がなければ差し戻す。change で現状または変更案の round が欠ける場合、選択領域に対応する round がない場合も差し戻す。
- 各`scenario × Selected Domain`と各`persona × scenario`のroundが1件以上なければ差し戻す。保存された構造coverageが100%でも、Data Coverage Matrixのmissingを解消したことにはしない。
- `finalEvaluationRef`はsynthesis後に生成されるため、いずれかのroundの`evidenceRefs`に含まれていれば循環参照として差し戻す。final evaluation以外のevidenceがどのroundにも使われていない場合も差し戻す。
- serverが記録する `recipe SHA-256`、各 persona と `evidence SHA-256` により、使用時点の recipe と根拠を固定する。pathだけ、deep linkだけ、未保存のtool出力だけを evidence として渡した run は差し戻す。
- run保存直後に`get_artifact(kind=run)`でreadbackし、`integrity.status=verified`でなければ完了扱いにしない。`failed`のmissing / mismatch / unreadableを修正し、sealまたはcoverageを欠くrecordは現行runとして受理しない。
- model と confidence の `reportedByClient=true` はクライアント申告であってserverによるモデル同定や品質保証ではない。この境界をレポートで逆転させた場合は差し戻す。
- `calibrationStatus` は実測結果との比較範囲を表す。予測対象、判定基準、観測結果を対応付けた実測がないのに `calibrated` とした場合は差し戻す。実測比較がなければ `not-calibrated`、一部だけなら `partially-calibrated` とし、confidenceの理由に未検証範囲を残す。

## 10. 反復と停止条件

選択された全領域の subagent が上記ゲートに合格するまで、修正、再評価、辛口批評を繰り返します。ただし同一指摘が、同じ欠損データのため2回続けて解消できない場合は、無限に書き換えません。「根拠不足として停止」と記録し、必要な外部データ、担当者判断、または実験を具体化して終了します。

合格記録には、適用対象となった各ゲートの pass、参照した根拠、未解消だが停止条件に該当した項目を残してください。
