# Evidence-grounded playtest rubric

目的は、実buildを操作して、仕様やストア情報だけでは分からない理解、入力、feedback、失敗、再挑戦の摩擦を時系列で観測することです。AIによる1回のtest playを、人間プレイヤーの楽しさ、需要、継続率の代表値にはしません。

## 1. Session protocol

開始前に次を固定します。

- build ID / version / commitと、development・staging・release candidateの区別
- platform、viewport / resolution、performance preset
- controlsとinput method
- player task: 達成したい具体的な目的
- start state: save、tutorial、inventory、所持品、既知情報
- end state: task成功、明示的な失敗条件、時間上限
- playtest duration: 1〜120分。通常のfocused sessionは15〜30分
- tester prior knowledge: source code、仕様、攻略情報、先行sessionを見たか

build、start state、controlsが不明なsessionは比較へ使わず、exploratory observationと明記します。

## 2. 操作方法

- HTTP(S) buildとbrowser/desktop controlを持つclientでは、実際にclick、key、controller相当入力を行う。ページを眺めただけでtest playと呼ばない。
- native buildは、clientが許可されたdesktop controlを持つ場合だけ直接操作する。MCP serverへ任意の実行file pathやcredentialを渡さない。
- 操作能力がない場合は、ユーザー実行のrecording、連続capture、input log、moderated sessionを受け取り、`observed-by-user`として区別する。
- destructiveなaccount操作、購入、公開投稿、save削除、外部送信を行わない。必要なら事前に明示的な許可を得る。

## 3. Chronological observation log

解釈を後付けせず、次を順番に記録します。

| Time / step | Player intent | Input / action | Action → response | Expected / observed difference | Friction / severity | Evidence ID |
|---|---|---|---|---|---|---|
| ［時刻］ | ［目的］ | ［入力］ | ［画面・音・状態変化］ | ［差］ | ［none / minor / material / blocker］ | ［capture/video/log］ |

少なくとも次を観測します。

- time to first meaningful action
- task completionと所要時間
- 誤入力、迷い、戻る操作、help参照
- feedback latencyまたはfeedback欠落
- failure → retryで、原因理解、再開位置、再挑戦コスト
- reward、progress、次の目標が認識できた時点
- frame drop、loading、crashなど観測できた技術的摩擦。ただし原因コードは推測しない

## 4. Test passes

1. First-read pass: 攻略情報を見ず、画面とfeedbackだけで進める。
2. Task pass: 固定player taskのhappy pathを実行する。
3. Recovery pass: 安全な範囲で誤入力、失敗、戻る、pause/resumeを試す。
4. Repeat pass: 同じtaskを再実行し、学習で摩擦が減るか、単なる偶然だったかを確認する。

change評価ではcurrentとproposalを同じbuild条件、task、controls、時間上限で別sessionにし、先に触った順序によるlearning biasをlimitationへ残します。

## 5. Validity boundary

- AIはルール追従、UI探索、再現可能な操作摩擦の検出には使えるが、人間の感情、身体感覚、疲労、楽しさ、市場需要の代表ではない。
- AI 1 testerのtask成功を、human completion rateやretentionへ変換しない。
- clientのinput injectionと実playerのcontroller feelを同一視しない。
- testerが仕様やsource codeを先に読んだ場合、discoverabilityのfirst-read evidenceとして使わない。
- blockerを見つけても原因実装を断定せず、再現手順、観測結果、必要logを示す。

## 6. Structured session evidence

`run-sim`の`playtestSession`は1回のbounded sessionを時系列の原本として受け取ります。各観測は`step`と`elapsedSeconds`を連続・非減少にし、Player intent、Input / Action、system response、friction severity、`rewardSignal`、Evidence IDを別fieldで記録します。つまり、Action、response、rewardSignalを一つの「面白かった」に統合しません。

- human participantでは仮名の`participantId`とtarget fitを必須にし、任意の`humanReport`でfelt reward、repeat intent、confusionを操作logと分離する。
- AI-operated sessionでは操作と観測だけを保存し、AIが人間の感情を代弁する`humanReport`は禁止する。
- completed以外は`stopReason`を必須にし、失敗・blocker・中断を成功へ丸めない。
- build、task、controlsとprompt protocolの完全一致はprovenanceだけを示し、体験の同等性やqualityを証明しない。

入力がある場合は`playtestSessionEvidence.resultHandle`を使い、モデルによる転記を挟まず`save_artifact(kind=intel)`へexact-saveします。handleがない、期限切れ、保存失敗のsessionを完全保存済みと主張しません。

### Lightweight retest lineage

通常の早期ブラッシュアップは、厳密なA/B実験を毎回要求せずsession lineageで追跡します。再検証するsessionでは`parentSessionId`、`changeSummary`、`changedVariables`、`invariantsKept`をすべて必須にし、親を指定せず比較設計fieldだけを追加した入力も受理しません。

- `sessionId`と`parentSessionId`は47文字以内のlowercase kebab-case IDとし、異なる値にする。これによりdiagnosticsが返すcanonical artifact IDの64文字上限内で`playtest-session-<sessionId>`へ保存できる。
- `changedVariables`は重複を禁止する。複数の変数を同時に変えた場合、差の因果帰属は`unresolved-multiple-changes`として未解決にする。
- 1変数と維持条件を宣言しても`comparison-candidate-only`であり、親sessionとtask、platform、controls、start state、target cohort、moderationが実際に一致した証明ではない。
- `parentEvidenceStatus=pending-exact-readback`は親IDが入力されたことだけを示す。保存済みparentを読めた後にだけ比較へ進む。
- 厳密な成功criterion、guardrail、複数scenario集計が必要なら`experiment.md`へ進み、軽量retestを事前登録済み実験と呼ばない。

### Bounded cohort aggregation

`playtestCohort`は2〜20件の完全なsessionを1つのbounded cohortとして保存します。`playtestSession`と`playtestCohort`は同時入力せず、単発観測かcohort原本の一方を選びます。cohortにはassembledAt、cohort ID、purpose、recruitment、target player定義、sampling boundaryを必須にし、session ID重複、未来sessionの混入、内部lineageの循環や時間逆転を受理しません。

`playtestCohortDiagnostics`は`sessionCount`、`uniqueHumanParticipantCount`、`repeatHumanParticipantCount`、tester type / outcome / human report statusの件数、session単位のfriction / reward coverage、protocol groups、lineage coverageを返します。

- AI-operated sessionとhuman participant sessionを分離し、両者の結果を一つのhuman metricへ混ぜない。
- 同一participantの複数sessionはrepeat exposureとして示し、独立participantが増えたと数えない。
- 観測件数・session件数をcompletion rate、retention rate、fun rate、需要率へ変換しない。このcohortに対する率の生成は禁止する。
- build、task、platform、controlsが異なるsessionを平均しない。group差は比較可能性のwarningであり、原因ではない。
- `playtestCohortEvidence.resultHandle`を使ってcohort原本を`playtest-cohort-<cohortId>`へexact-saveし、session本文をモデルが再集計用に転記しない。
- 厳密なscenario差、sample minimum、success criterion、guardrailが必要なら、cohort件数から後付けthresholdを作らず`experiment.md`で事前登録する。

## 7. playtest provenance

`playtestSession`入力は前節のresultHandleでexact-saveします。prompt外で受け取ったrecordingやlogだけを保存する場合は、検証済みsessionと混同せず`save_artifact(kind=intel, sourceTool=manual)`でprovenanceを保存します。

- build ID、URLまたは配布経路の非機密識別子
- session開始・終了時刻とduration
- platform、resolution、controls
- player task、start state、end state
- tester prior knowledgeとclient/tool
- chronological observations
- capture / video / log Evidence IDs
- completed / failed / blockedと停止理由
- 再現回数と既知のlimitation

credential、local absolute path、未公開secretはpayloadへ入れません。top-level observedAtは権威あるsession時刻を保持している場合だけ渡し、不明ならserver clockへ委ねます。

## 8. Required output

- Session verdict: completed / failed / blocked
- Top observed frictions: 再現手順、severity、Evidence ID
- Demonstrated strengths: 実操作で確認したfeedback、recovery、learning
- Unknowns: 人間playtest、telemetry、別deviceが必要な判断
- Next playtest: build、task、participant、成功指標
