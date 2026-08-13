# steam-user-sim v1.1 User-Complete Workflow Design

**Status:** Implemented and dogfood-validated (3/3 consultations, replay audit PASS, UI quality-gap PASS); outcome calibration pending
**Date:** 2026-08-11

## Goal

汎用MCPクライアントから、競合探索、根拠収集、UI画像確認、ペルソナ素材生成、レポート保存、過去相談の再読込までを完結できるようにする。

v1のSteam取得・persona保存・canonical knowledgeは維持する。v1.1では、ユーザーが別のローカルファイルtoolを持っていることを前提にしていた部分をMCPのtool resultへ移す。

## Client contract

コアworkflowに必要なクライアント能力は次の3つだけとする。

- MCP toolsを呼べる。
- MCP promptsを取得できる。
- tool resultの標準ImageContentを表示またはモデルへ渡せる。

ローカルfilesystem、subagent、独自の画像読取toolは必須にしない。対応クライアントがsubagentを持つ場合は並列評価に利用してよいが、ない場合は同一モデルが独立した領域評価を順番に実行する。

v1.1で直接受ける対象入力は仕様テキストとHTTP(S) URL。zipはMCPサーバーへ任意ファイル読取権限を追加せず、クライアント側で展開して関連テキストをpromptへ渡す。

## Tool surface

既存8 toolは名前と主要data shapeを維持する。

| Tool | v1.1 role |
|---|---|
| steam_search | 既知名からappid候補を検索 |
| steam_fetch | 3地域価格、英/日/独requested-locale store copy、categories、画像、Steam Sonar/SteamDB deep link、SteamSpy情報 |
| steam_reviews | 条件付きrecent review |
| steam_timeline | SteamSpy snapshotと任意ITAD履歴 |
| derive_personas | 出典付きpersona素材。市場代表サンプルではないことをmetaへ明記 |
| save_persona | schema検証済みpersonaを保存 |
| ui_capture | pageをPNG capture、Steam CDN画像をJPEG保存し、上限内ならImageContentを同じresultへ含める |
| get_knowledge | canonical templates、rubrics、personasを取得 |
| steam_discover | SteamSpyのtagまたはgenreから競合候補を取得 |
| save_artifact | intel JSON、canonical構造を満たすevaluation Markdown、またはimmutable simulation runを安全に保存 |
| get_artifact | intel、evaluation、run、capture、ui-referenceを一覧または読出し |

最終構成は11 tools、2 prompts。

## Artifact model

### Layout

- knowledge/intel/{targetId}/{artifactId}.json
- workspaces/{targetId}/{date}-{topicId}.md
- workspaces/{targetId}/runs/{runId}.json
- knowledge/intel/captures/{captureId}.png または .jpg
- knowledge/ui-references/{referenceId}.png

target、topic、idは1〜80文字の表示名として受ける。ただし正規化前に`/`、`\\`、NUL、絶対path、dot-onlyをrejectする。サーバーは残りを最大64文字の安全なslugへ正規化し、空または上限超過ならrejectする。return dataにはcanonical IDとrepo-relative pathを返し、クライアント入力に任意のpathを公開しない。

### save_artifact

kindで分岐する。

intel:

- target
- id
- sourceTool
- observedAt、省略可
- payload
- overwrite、省略時false

保存JSONはschemaVersion、targetId、artifactId、sourceTool、observedAt、savedAt、payloadを持つ。直接入力でobservedAtを省略した場合は、1回だけ取得したサーバー時刻をobservedAtとsavedAtの両方に使う。権威ある観測時刻をクライアントが保持している場合は明示値を維持する。payloadのserialized sizeは1 MiB以下。

sourceToolはsteam_search、steam_discover、steam_fetch、steam_reviews、steam_timeline、derive_personas、ui_capture、manualのいずれかとする。

外部取得とderive_personasの1 MiB以下の返り値は、meta.resultHandle付きの正規化されたtool envelopeとしてserver process内に最近32件を保持する。save_artifactはresultHandleだけでsourceTool、observedAt、warning、metaを含む原本payloadを原子的に保存できる。handleはserver再起動または32件超過で無効になり、不明なhandleはtool errorにする。sourceTool、payload、任意のobservedAtを渡す直接入力は互換用に維持する。

evaluation:

- target
- topic
- date、省略時サーバーの現在日
- content
- overwrite、省略時false

Markdownは512 KiB以下。既存ファイルはoverwriteが明示されない限り変更しない。保存は同一directoryの一時ファイルからatomicに確定する。

run:

- target、topic、mode、selectedDomains
- client-reported model
- baselineは1件、changeは2件以上のscenarios
- personaIds、保存済みartifactを指すevidence refs
- 1から連続するpersona/domain/critic/synthesis rounds
- warnings、confidence、calibrationStatus、finalEvaluationRef

サーバーは各scenario × Selected Domain、各persona × scenario、final evaluation以外の全evidence利用を完全性ゲートにする。synthesis後に作るfinalEvaluationRefをroundが参照する循環はrejectする。

サーバーはpersona、evidence、現在のrun-sim recipeを実際に読み、各exact bytesのSHA-256、domain別のevidence kind/source toolを含む構造coverage、recordのcanonical SHA-256 sealを入れる。modelとconfidenceはserver attestationではないため`reportedByClient=true`を付ける。UUID run IDごとに最大2 MiBのJSONをatomicに作成し、overwriteを受け付けない。参照欠落、symlink、不正schema、record/path不一致はtool error。これにより入力と出力の監査・再生材料を固定するが、LLM出力の決定性は保証しない。

runの単体readは保存recordに加え、recipe、persona、evidenceを現在のpathから安全に再読込してSHA-256を照合したintegrity reportを返す。statusはverifiedまたはfailed。failedはmissing、mismatch、unreadableをdependency別に返し、record自体が読める場合は本文を隠さない。現行schemaではsealとcoverageを必須とし、欠落recordは不正schemaとして拒否する。canonical sealは偶発編集検知用checksumであり、署名や外部attestationではない。

### get_artifact

kindはintel、evaluation、run、capture、ui-reference。

- intel/evaluation/runでtarget省略: target一覧
- targetあり、id省略: artifact一覧
- targetとidあり: 内容取得。runはmetadata、record、integrity report
- capture/ui-referenceでid省略: 画像一覧（captureはPNG/JPEG、ui-referenceはPNG）
- idあり: metadataとImageContent

一覧はid、repo-relative path、sizeBytes、modifiedAtを返す。MarkdownとJSONはstructured dataとtext contentへ含める。画像はstructured dataにmetadataを入れ、contentへbase64 ImageContentを追加する。

## Image delivery

ui_captureの既定 `sourceType=page` は既存のObscura経路でPNGを生成する。`sourceType=steam-image` は `steam_fetch.screenshots` 用で、HTTPSの `steamstatic.com` とsubdomainだけからJPEGを直接取得する。credentials、custom port、redirect、non-JPEG responseを拒否し、viewport/fullPageは受け付けない。成功resultは既存のdataとwarningsを維持し、有効なPNG/JPEGが6 MiB以下ならImageContentを追加する。

page captureが6 MiBを超える場合、capture自体は成功としてpathを返すが、imageIncluded=falseとinline上限warningを返す。Steam直接取得はstreamとContent-Lengthの両方で6 MiBをhard limitにし、超過時は保存しない。MCP stdioの既定10 MiB message limitにbase64 overheadを含めて収めるため、raw image上限を6 MiBとする。

get_artifactでcaptureを読む場合はPNG/JPEG、ui-referenceはPNGに限定し、同じ上限と形式別signature検証を使う。同一capture IDのPNG/JPEGが両方存在する場合は曖昧性errorにする。symlinkと許可root外はtool error。

## Result provenance

FetchResultへ任意のmetaを追加する。既存のdataとwarningsは変更しない。

metaは次を持てる。

- observedAt
- sources: name、homepage、notes
- request: 秘密を含まないfilter条件
- methodology: samplingや推定値の解釈

ITAD keyやquery全体をmetaへ保存しない。

SteamSpy由来値には、推定値であること、recent releaseと小標本で信頼性が低いことをnotesへ含める。ownersは販売本数ではなく所有推定範囲として扱う。出典上の注意事項は[SteamSpy About](https://www.steamspy.com/about)へ紐付ける。

SteamSpyがaverage_forever=0を返した場合、avgPlaytimeHoursはnullとし、reported zeroを欠損相当として扱ったwarningとmethodologyを返す。CCU=0は有効なsnapshotとして保持する。

## Persona sampling contract

derive_personasは1 appid・1極性あたりの件数を`reviewsPerPolarity` 3〜25件で受け、未指定時は後方互換の25件とする。通常の3〜5 persona生成には8件を推奨し、深掘り監査では25件を使える。Japanese-firstで集めた後、appidとpositive/negativeをラウンドロビンに並べ、出力位置による単一appid・単一極性への偏りを抑える。

肯定・否定の同数抽出は問題発見用の意図的なpolarity-balanced sampleであり、レビュー母集団の比率を表さない。

meta.methodologyへ次を入れる。

- strategy: recent-polarity-balanced
- ordering: round-robin-appid-polarity
- representative: false
- requestedPerPolarity
- appidごとのpopulation positive/negative
- polarityごとのJapanese selected、fallback selected、total selected
- caveat

最終レポートでFlow sizeやAdoption Likelihoodを50対50の比率から推定することをpromptとrubricで禁止する。母集団の好評率はsteam_fetchのreviewStatsを別根拠として使う。

## Competitor discovery

steam_discoverはSteamSpy APIのtagまたはgenre requestを使用する。単独の`value`は従来どおりAPI順を保つ。任意の`additionalValues`（最大3件）がある場合は各条件の上位50件を交差し、API順位合計で並べる。対象自身などは`excludeAppids`（最大50件）で除外できる。交差候補には`matchedValues`と`sourceRanks`を付け、最終候補はsteam_fetchで再検証する。

Input:

- kind: tagまたはgenre
- value: 1〜80文字
- additionalValues: 任意、1〜80文字を最大3件。指定時はvalueを含む全条件で交差
- excludeAppids: 任意、positive safe integerを最大50件
- limit: 1〜50、default 20

Output:

- query
- observedAt
- candidates: rank、appid、name、owners、ccu、positive、negative、positivePercent。交差時はmatchedValues、sourceRanksも含む
- methodology: SteamSpy推定値の注意。交差時はpoolとranking規則も含む

単独条件ではAPIの順序をrankとして保存し、client側で根拠なく再ランキングしない。交差条件では各API順位をsourceRanksへ保存し、その合計だけでrankを決める。malformed entryは除外し、除外数をwarningへ出す。空結果は成功dataとwarningを返す。交差のいずれかのrequestが失敗した場合は確定不能としてdataをnullにし、理由をwarningへ出す。

## Prompt inputs and scoped workflow

run-sim promptは次のstring argumentsを持つ。

- target、required
- topic、required
- mode: baselineまたはchange、default baseline
- domains: gameplay、storefront、ui、price、localization、competitionのcomma-separated list。default auto
- specification
- playtestUrl: credentialなしHTTP(S) URL。指定時はplaytestTask必須
- playtestTask
- playtestBuild
- playtestControls
- playtestDurationMinutes: 1〜120のstring
- uiUrl
- uiBenchmarkTask
- uiReferenceUrls: credentialなしHTTPS URLを改行またはcomma区切りで最大8件
- currentState
- proposal
- competitors
- market
- language
- qualityTier

prompt callbackはrecipe本文と入力を明確に区切って1つのuser messageへする。changeでcurrentStateまたはproposalがない場合は、評価開始前に不足入力を質問するよう指示する。

auto scopeはtopicと入力から必要領域を選び、その理由を最初に宣言する。UIがscope外ならui_capture、blind compare、UI rubricはN/Aであり不合格理由にしない。

UIがscope内なら、具体的なplayer task、開始・完了状態、platform、controlsを`uiBenchmarkTask`で固定する。Game UI Database、Interface In Gameなどの`uiReferenceUrls`はreference候補探索に使い、同じtask、screen state、platform、controls、近い情報量、qualityTierの出荷済み製品を2〜4本選ぶ。catalog掲載や人気を品質根拠にせず、source URL、accessedAt、game、screen state、capture IDをmanual intel artifactへ保存する。公開APIやbulk scrapingを仮定せず、robots、認証、利用条件、download制限を回避しない。

gameplayはプレイヤーから観測できるコアループ、目標、feedback、進行、失敗/再挑戦を扱う。description、categories、tags、reviewsはplayer-perceived proxyであり、内部コード、状態遷移、数式、バランス実装の直接根拠ではない。内部ロジックの評価には仕様、build、動画、telemetry、playtestのいずれかを要求する。browser/desktop controlを持つclientは固定したbuild ID、task、start/end state、controls、時間上限で実操作し、Action → responseの時系列logをmanual intelとして保存する。操作能力がなければユーザー実行のrecording等へ切り替え、ページ閲覧だけをtest playと呼ばない。AI 1 testerを人間のfun、completion rate、retentionの代表値にしない。

storefrontは短文・詳細説明、価値提案、localized copy、capsule/screenshots、競合との期待差を扱う。localizedStorefrontsはenglish=US、japanese=JP、german=DEのrequested localeで、Steam fallbackの可能性をmethodologyに残す。`matchesEnglishCopy` は正規化後の英語copyとの完全一致だけを表し、fallbackの理由や翻訳品質は断定しない。referenceLinksはnavigation用であり、リンク先をcaptureまたはartifact保存するまでは取得済みEvidenceにしない。

ui-blind-compare promptはtargetImageId、referenceImageIds、context、qualityTierを受け取る。AAAを全案件の固定基準にせず、指定qualityTierと同等の出荷済み製品に対する品質差を評価する。pre-reveal判定を固定した後、0〜4の軸別score、reference中央値、`gap = target - median`、material deficits、demonstrated strengthsを出す。static screenshotで確認できないmotion、latency、controller feel、未表示stateは0ではなくunscoredにする。

## Evaluation persistence flow

1. get_artifact kind=evaluation、targetなしで既存targetを確認。
2. 対象targetの過去evaluationを一覧・必要分読込。
3. get_knowledgeでtemplate、rubric、personaを取得。
4. steam_searchまたはsteam_discoverで競合候補を作る。
5. Steam tool出力のmeta.resultHandleを取得直後にsave_artifact kind=intelへ渡し、モデルがpayloadを再serializeせず原本保存。
6. derive_personasの返り値もresultHandleでintel artifactとして原本保存し、Evidence Indexに追加してからsave_personaを実行。
7. 選択domainだけ評価する。UIではGame UI Database等からmatched cohortを選び、画像とprovenanceを保存してblind comparisonと軸別gapを実行。
8. save_artifact kind=evaluationでレポート保存。
9. evidence-coverage rubricの固定dimensionからCoverage rateとDirect observation rateを作り、blocking missingをconfidenceへ反映。
10. save_artifact kind=runでscenarios、persona、evidence、全round、warning、confidence、最終evaluationをimmutable ledgerへ封印。
11. get_artifact kind=runでreadbackし、integrity.status=verifiedを確認。
12. evaluation path、run ID、run path、coverage、integrity、未解決事項をユーザーへ報告。

## Compatibility

- 既存8 toolの名前を変更しない。
- FetchResultのdataとwarningsを維持し、metaはoptional追加。
- ui_captureのstructured dataは既存fieldを維持し、imageIncluded、id、relativePath、sourceTypeを追加。
- get_knowledgeの既存kindと動作を維持する。dynamic artifactはget_artifactへ分離。
- save_personaの保存形式を変更しない。

## Security and limits

- 全artifact pathは共通resolverを通す。
- Steam画像の直接取得はHTTPS `steamstatic.com` allowlist、redirect禁止、6 MiB hard limitを通す。
- knowledge、skillsに加えworkspacesの存在をstartup時に検証する。
- target/id/date/topicのbasename、slug、拡張子、containment、symlinkを検証する。
- writeはatomic。intel/evaluationはoverwrite default false、runは常にimmutable。
- intel JSON 1 MiB、evaluation Markdown 512 KiB、run JSON 2 MiB、inline image 6 MiB。evaluationは必須sectionと非空本文、Indie Survival Strategyの詳細sectionまたは具体的な適用外理由を保存時に検査し、未記入placeholderを拒否する。
- JSON parse失敗、PNG/JPEG signature違反、path違反はtool error。
- uiReferenceUrlsは最大8件、credentialなしHTTPSだけを受け、fragmentと重複を除去する。
- 外部APIの期待される失敗は引き続きdata、warnings、metaの部分成功。

## Non-goals

- サーバー側LLMまたはsimulation実行engine（client出力のrun ledger保存は対象）
- サーバー側subagent orchestration
- 任意zipの展開
- 任意filesystem pathの読書き
- 過去CCU収集、急上昇検出
- npm global bin、remote deployment

これらはuser-complete workflowの検証後に別バージョンで扱う。
