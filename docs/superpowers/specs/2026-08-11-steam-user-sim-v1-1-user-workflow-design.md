# steam-user-sim v1.1 User-Complete Workflow Design

**Status:** Approved direction, implementation pending
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
| steam_fetch | 3地域価格、言語、タグ、SteamSpy情報 |
| steam_reviews | 条件付きrecent review |
| steam_timeline | SteamSpy snapshotと任意ITAD履歴 |
| derive_personas | 出典付きpersona素材。市場代表サンプルではないことをmetaへ明記 |
| save_persona | schema検証済みpersonaを保存 |
| ui_capture | PNG保存に加え、上限内ならImageContentを同じresultへ含める |
| get_knowledge | canonical templates、rubrics、personasを取得 |
| steam_discover | SteamSpyのtagまたはgenreから競合候補を取得 |
| save_artifact | intel JSONまたはevaluation Markdownを安全に保存 |
| get_artifact | intel、evaluation、capture、ui-referenceを一覧または読出し |

最終構成は11 tools、2 prompts。

## Artifact model

### Layout

- knowledge/intel/{targetId}/{artifactId}.json
- workspaces/{targetId}/{date}-{topicId}.md
- knowledge/intel/captures/{captureId}.png
- knowledge/ui-references/{referenceId}.png

target、topic、idは1〜80文字の表示名として受ける。ただし正規化前に`/`、`\\`、NUL、絶対path、dot-onlyをrejectする。サーバーは残りを最大64文字の安全なslugへ正規化し、空または上限超過ならrejectする。return dataにはcanonical IDとrepo-relative pathを返し、クライアント入力に任意のpathを公開しない。

### save_artifact

kindで分岐する。

intel:

- target
- id
- sourceTool
- observedAt
- payload
- overwrite、省略時false

保存JSONはschemaVersion、targetId、artifactId、sourceTool、observedAt、savedAt、payloadを持つ。payloadのserialized sizeは1 MiB以下。

sourceToolはsteam_search、steam_discover、steam_fetch、steam_reviews、steam_timeline、derive_personas、ui_capture、manualのいずれかとする。

evaluation:

- target
- topic
- date、省略時サーバーの現在日
- content
- overwrite、省略時false

Markdownは512 KiB以下。既存ファイルはoverwriteが明示されない限り変更しない。保存は同一directoryの一時ファイルからatomicに確定する。

### get_artifact

kindはintel、evaluation、capture、ui-reference。

- intel/evaluationでtarget省略: target一覧
- targetあり、id省略: artifact一覧
- targetとidあり: 内容取得
- capture/ui-referenceでid省略: PNG一覧
- idあり: metadataとImageContent

一覧はid、repo-relative path、sizeBytes、modifiedAtを返す。MarkdownとJSONはstructured dataとtext contentへ含める。画像はstructured dataにmetadataを入れ、contentへbase64 ImageContentを追加する。

## Image delivery

ui_capture成功resultは既存のdataとwarningsを維持し、PNGが6 MiB以下かつPNG signatureを持つ場合にImageContentを追加する。

6 MiBを超える場合、capture自体は成功としてpathを返すが、imageIncluded=falseとinline上限warningを返す。MCP stdioの既定10 MiB message limitにbase64 overheadを含めて収めるため、raw image上限を6 MiBとする。

get_artifactでcaptureまたはui-referenceを読む場合も同じ上限とsignature検証を使う。symlinkと許可root外はtool error。

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
- domains: ui、price、localization、competitionのcomma-separated list。default auto
- specification
- uiUrl
- currentState
- proposal
- competitors
- market
- language
- qualityTier

prompt callbackはrecipe本文と入力を明確に区切って1つのuser messageへする。changeでcurrentStateまたはproposalがない場合は、評価開始前に不足入力を質問するよう指示する。

auto scopeはtopicと入力から必要領域を選び、その理由を最初に宣言する。UIがscope外ならui_capture、blind compare、UI rubricはN/Aであり不合格理由にしない。

ui-blind-compare promptはtargetImageId、referenceImageIds、context、qualityTierを受け取る。AAAを全案件の固定基準にせず、指定qualityTierと同等の出荷済み製品に対する品質差を評価する。

## Evaluation persistence flow

1. get_artifact kind=evaluation、targetなしで既存targetを確認。
2. 対象targetの過去evaluationを一覧・必要分読込。
3. get_knowledgeでtemplate、rubric、personaを取得。
4. steam_searchまたはsteam_discoverで競合候補を作る。
5. Steam tool出力をsave_artifact kind=intelで保存。
6. derive_personasとsave_personaを実行。
7. 選択domainだけ評価し、必要な場合だけUI画像を取得・比較。
8. save_artifact kind=evaluationでレポート保存。
9. return dataのrepo-relative pathと未解決事項をユーザーへ報告。

## Compatibility

- 既存8 toolの名前を変更しない。
- FetchResultのdataとwarningsを維持し、metaはoptional追加。
- ui_captureのstructured dataは既存fieldを維持し、imageIncluded、id、relativePathを追加。
- get_knowledgeの既存kindと動作を維持する。dynamic artifactはget_artifactへ分離。
- save_personaの保存形式を変更しない。

## Security and limits

- 全artifact pathは共通resolverを通す。
- knowledge、skillsに加えworkspacesの存在をstartup時に検証する。
- target/id/date/topicのbasename、slug、拡張子、containment、symlinkを検証する。
- writeはatomic、overwrite default false。
- intel JSON 1 MiB、evaluation Markdown 512 KiB、inline PNG 6 MiB。
- JSON parse失敗、PNG signature違反、path違反はtool error。
- 外部APIの期待される失敗は引き続きdata、warnings、metaの部分成功。

## Non-goals

- サーバー側LLMまたはrun_sim engine
- サーバー側subagent orchestration
- 任意zipの展開
- 任意filesystem pathの読書き
- 過去CCU収集、急上昇検出
- npm global bin、remote deployment

これらはuser-complete workflowの検証後に別バージョンで扱う。
