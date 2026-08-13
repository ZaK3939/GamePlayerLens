# steam-user-sim v1.1 User-Complete Workflow Implementation Plan

**Status:** Implemented and dogfood-validated (3/3 consultations, replay audit PASS, UI quality-gap PASS). Outcome calibration is pending.
**Design:** [v1.1 user workflow design](../specs/2026-08-11-steam-user-sim-v1-1-user-workflow-design.md)

## Goal

汎用MCPクライアントが追加のfilesystem・画像toolなしで、競合探索、根拠保存、UI画像確認、レポート保存、相談履歴再利用まで完結できるv1.1を実装する。

## Global constraints

- 既存8 toolの名前と主要data shapeは維持する。
- 追加toolはsteam_discover、save_artifact、get_artifactの3個。最終11 tools、2 prompts。
- FetchResultはdata、warningsを維持し、metaだけoptional追加する。
- サーバー側LLM、subagent、run_simは追加しない。
- 外部設定はITAD_API_KEYとOBSCURA_PATHの2つだけ。
- 全pathは共通resolver、全writeはatomic、overwrite default false。
- intel JSON 1 MiB、canonical構造を満たすevaluation Markdown 512 KiB、inline PNG 6 MiB。
- 決定的テストは外部HTTP client全体をmockせず、正規化とservice dependencyをfixtureで検証する。
- live appidはHades 1145360。SteamSpy tag live smokeはAction Roguelike。
- 各Taskはfailing test、implementation、pass gate、1 commitの順。

## Implemented follow-up: replayable simulation run ledger

11-tool surfaceを維持したまま、`save_artifact` / `get_artifact` に kind=`run` を追加した。clientが実行したsimulationのscenarios、domains、persona、保存済みevidence、全round出力、warning、confidence、最終evaluationを、server側で参照検証して `workspaces/{targetId}/runs/{runId}.json` にimmutable保存する。recordは使用時点のrecipe、persona、evidenceのSHA-256とclient-reported model/calibration境界を持つ。unit、in-memory MCP、stdio/package smokeで保存・一覧・再読込を検証する。

UI実力差follow-upでは、run-simへ`uiBenchmarkTask`と最大8件の`uiReferenceUrls`を追加し、Game UI Database / Interface In Gameをmatched reference探索へ組み込む。新しい`ui-quality-gap.md` rubricで、2〜4本の出荷済みcohort、reference provenance、匿名pre-reveal採点、0〜4 anchor、reference中央値との差、static/videoの証拠境界を固定する。公開APIやbulk scrapingは仮定せず、画像とmanual intel provenanceを分離保存する。

分析精度・integrity follow-upでは、11-tool surfaceを維持したまま、run保存時に全scenario × domain、全persona × scenario、全analysis evidence利用を機械検証し、final evaluationの循環参照を拒否する。新規runは構造coverageとcanonical SHA-256 sealを必須とし、read時にrecipe、persona、全evidenceを再hashしてverified / failedを返す。canonical `evidence-coverage.md`はdomain別の固定dimension、Coverage rate、Direct observation rate、blocking missingのconfidence境界を定義する。

test play follow-upではrun-simにboundedなplaytestUrl/task/build/controls/duration入力を追加し、browser/desktop controlを持つclientによる実操作、またはユーザー実行recordingを`playtest.md`で標準化する。Action → response、first meaningful action、task completion、failure/retryを保存し、AI 1 testerを人間行動の代表値へ変換しない。

---

## Task 1: Result metaとartifact path境界

### Files

- Modify: src/http.ts
- Modify: src/paths.ts
- Modify: src/http.test.ts
- Modify: src/paths.test.ts

### Interfaces

FetchResultへoptional metaを追加する。

- observedAt: ISO date-time
- sources: name、homepage、notes
- request: secretを含まないJSON
- methodology: JSON

PathResolverへ次を追加する。

- resolveIntelArtifactPath(target, id)
- resolveEvaluationPath(target, date, topic)
- resolveCaptureReadPath(id)
- resolveUiReferencePath(id)

target、id、topicは1〜80文字の表示名を受け、安全slugへ正規化するpure functionを共有する。`/`、`\\`、NUL、絶対path、dot-onlyは正規化前にrejectし、canonical IDは1〜64文字とする。resolve resultはcanonical ID、absolute path、repo-relative pathを返せるようにする。

### Tests first

- [ ] FetchResultの既存data、warningsだけの値が引き続き型・runtime contractを満たす。
- [ ] metaがJSON-safeなobservedAt、sources、request、methodologyを保持する。
- [ ] key、token、URL queryをmetaへ入れるhelperを作らないことをcontract testで確認する。
- [ ] target Hades II、topic JP price testをhades-ii、jp-price-testへ正規化する。
- [ ] 空slug、dot-only、traversal、slash、backslash、NUL、absolute path、65文字超canonical IDをrejectする。
- [ ] intelはknowledge/intel/{target}/{id}.jsonだけを解決する。
- [ ] evaluationはworkspaces/{target}/{YYYY-MM-DD}-{topic}.mdだけを解決する。
- [ ] captureとui-referenceはbasename PNGだけを読む。
- [ ] parent directoryまたは既存fileがsymlinkならrejectする。
- [ ] production startupはknowledge、skills、workspacesのいずれか欠落で即時失敗する。

### Implementation

- [ ] FetchMeta、FetchSource、JsonValue型をsrc/http.tsへ追加する。
- [ ] safeSlugをexportせずPathResolver内部の共通関数として実装する。
- [ ] nested target directoryをresolve後にroot containmentで再検証する。
- [ ] resolver自身はdirectoryやfileを作成しない。
- [ ] workspacesをfindRepoRootの必須directoryへ追加する。

### Gate and commit

- [ ] pnpm test -- src/http.test.ts src/paths.test.ts
- [ ] pnpm build
- [ ] Commit: feat: result metadata and safe artifact path boundaries

---

## Task 2: Atomic artifact store

### Files

- Create: src/artifacts.ts
- Create: src/artifacts.test.ts
- Modify: src/paths.ts

### Interfaces

ArtifactStore:

- saveIntel(input, overwrite?)
- saveEvaluation(input, overwrite?)
- listTargets(kind)
- listArtifacts(kind, target)
- readIntel(target, id)
- readEvaluation(target, id)

Intel stored shape:

- schemaVersion: 1
- targetId
- artifactId
- sourceTool
- observedAt
- savedAt
- payload

sourceToolはsteam_search、steam_discover、steam_fetch、steam_reviews、steam_timeline、derive_personas、ui_capture、manualのenumとする。

Evaluation metadataはpath、targetId、id、date、topicId、savedAt、sizeBytesを返す。Markdown本文は変更せず保存する。

### Tests first

- [ ] temp rootでintel JSONのsave、list、read round-trip。
- [x] canonical evaluation Markdownの構造検査、save、list、read round-trip。
- [ ] display targetとtopicからcanonical IDsとrepo-relative pathを返す。
- [ ] default overwrite falseで既存fileを原子的にrejectする。
- [ ] overwrite trueでatomic replaceする。
- [ ] rename/link失敗時に自分のtemporary fileだけ削除する。
- [ ] unrelated hidden filesとtemporary filesをlistへ出さない。
- [ ] malformed stored intel JSONをread時にschema errorにする。
- [ ] intel serialized payloadが1 MiB超ならwrite前にrejectする。
- [ ] evaluation UTF-8 bytesが512 KiB超ならwrite前にrejectする。
- [ ] invalid observedAt、sourceTool、empty contentをrejectする。
- [ ] targetなし一覧はtarget IDsだけ、targetあり一覧はartifact metadataだけを返す。

### Implementation

- [ ] ZodでIntelRecord、save input、artifact metadataを定義する。
- [ ] dateは実在するYYYY-MM-DDだけ許可し、省略時はinjected clockから生成する。
- [ ] missing target directoryは許可root直下にだけmkdir recursiveで作る。
- [ ] directory作成後にもrealpath containmentとsymlinkを再検証する。
- [ ] temp write、hard linkまたはrename、temp unlinkの順でatomic saveする。
- [ ] list順はevaluationがdate descending、intelがid ascending。

### Gate and commit

- [ ] pnpm test -- src/artifacts.test.ts src/paths.test.ts
- [ ] pnpm build
- [ ] Commit: feat: atomic intel and evaluation artifact store

---

## Task 3: MCP ImageContent delivery

### Files

- Create: src/images.ts
- Create: src/images.test.ts
- Modify: src/capture.ts
- Modify: src/capture.test.ts
- Modify: src/artifacts.ts
- Modify: src/artifacts.test.ts

### Interfaces

Image service:

- listImages(captureまたはui-reference)
- readImage(kind, id)
- imageContentFor(path)

read resultはid、kind、relativePath、mimeType、sizeBytes、modifiedAt、imageIncludedを持つ。imageIncluded=trueのときMCP ImageContent用base64を返す。

ui_capture dataへid、relativePath、imageIncluded、sizeBytesを追加する。既存path、url、capturedAtは維持する。

### Tests first

- [ ] PNG magic bytesを持つ6 MiB以下fileをbase64 image/pngへ変換する。
- [ ] extensionがPNGでもsignature違反ならtool error相当のexception。
- [ ] 6 MiB超ではmetadataを返し、imageIncluded falseと上限warning。
- [ ] captureとui-referenceを別rootから安全にlist/readする。
- [ ] nested directory、non-PNG、dotfile、symlinkをlistから除外またはrejectする。
- [ ] ui_capture成功service testがPNGを書き、resultにinline image metadataを含む。
- [ ] ui_capture失敗時は不完全fileだけ削除し、manual fallback warningを維持する。
- [ ] localhost時だけObscura allow-private-networkを付ける既存testを維持する。

### Implementation

- [ ] MAX_INLINE_IMAGE_BYTESを6 MiB固定にする。
- [ ] PNG 8-byte signatureを検証する。
- [ ] base64はread後にsize checkし、巨大fileを不用意にencodeしない。
- [ ] capture result組立てとImageContent組立てを分離する。
- [ ] absolute pathは互換用に残し、generic client用relativePathを追加する。

### Gate and commit

- [ ] pnpm test -- src/images.test.ts src/capture.test.ts src/artifacts.test.ts
- [ ] pnpm build
- [ ] Commit: feat: inline MCP image delivery for UI artifacts

---

## Task 4: steam_discover competitor candidates

### Files

- Create: src/discovery.ts
- Create: src/discovery.test.ts
- Create: src/discovery.live.test.ts

### Interfaces

discoverGames(input):

- kind: tagまたはgenre
- value: trimmed 1〜80文字
- limit: integer 1〜50、default 20

Result data:

- query
- observedAt
- candidates
- methodology

Candidate:

- rank
- appid
- name
- owners
- ccu
- positive
- negative
- positivePercent

### Tests first

- [ ] SteamSpy object keyed by appidをAPI順のrank付き配列へ正規化する。
- [ ] numeric stringをstrict parserで受け、null、blank、booleanを0へしない。
- [ ] invalid appid/name entryを除外し、除外数warning。
- [ ] positiveとnegativeが有効かつtotal>0のときだけpositivePercentを作る。
- [ ] limit 0、51、fraction、空value、unknown kindをrejectする。
- [ ] URLSearchParamsがrequest、tagまたはgenreをencodeし、warningへURL queryを出さない。
- [ ] API失敗はdata nullとsource-scoped warning。
- [ ] 空objectは空candidatesとno candidates warning。
- [ ] live Action Roguelike tagがpositive appidとnameを1件以上返す。

### Implementation

- [ ] SteamSpy request=tagまたはrequest=genreを使用する。
- [ ] fetchJsonの8秒timeoutを維持する。
- [ ] successful responseでもSteamSpy estimate caveatをmethodologyへ入れる。
- [ ] API orderをrankとして保持し、独自scoreを作らない。
- [ ] observedAtはinjected clockでtest可能にする。

### Gate and commit

- [ ] pnpm test -- src/discovery.test.ts
- [ ] pnpm test:live -- src/discovery.live.test.ts
- [ ] pnpm build
- [ ] Commit: feat: SteamSpy tag and genre competitor discovery

---

## Task 5: Provenance、sampling、zero-quality semantics

### Files

- Modify: src/steam.ts
- Modify: src/steam.test.ts
- Modify: src/reviews.ts
- Modify: src/reviews.test.ts
- Modify: src/timeline.ts
- Modify: src/timeline.test.ts
- Modify: src/personas.ts
- Modify: src/personas.test.ts
- Modify: corresponding live tests

### Result meta contract

各external toolは可能な範囲でmeta.observedAt、sources、request、methodologyを返す。

- steam_search: queryとSteam Store source
- steam_fetch: countriesとSteam Store、SteamSpy source notes
- steam_reviews: language、type、minPlaytimeHours、limit、scanned count
- steam_timeline: SteamSpy、ITAD availabilityとcountry/since
- derive_personas: polarity-balanced sampling details

### Tests first

- [ ] 既存data、warnings assertionsを壊さずmetaが追加される。
- [ ] SteamSpy source notesにownersはsalesではない、estimate、recent/small sample caveatがある。
- [ ] API keyとfull queryがmeta JSONへ入らない。
- [ ] review metaが実際のscanned raw countとfiltersを保持する。
- [ ] average_forever=0はavgPlaytimeHours null、reported-zero warning、methodology statusを返す。
- [ ] ccu=0は有効な0として保持しwarningにしない。
- [ ] derive resultがrepresentative falseとrecent-polarity-balancedを返す。
- [ ] appidごとにpopulation positive/negativeをgame profileから保存する。
- [ ] polarityごとにJapanese selected、fallback selected、total selectedを正しく数える。
- [ ] Japaneseだけで25件ならfallback selected 0。
- [ ] fallback重複除去後のselected countとmetadataが一致する。
- [ ] fetchGame失敗時もsampling metadataとwarningを部分成功で返す。

### Implementation

- [ ] external fetcherへclock injection可能なfactoryを追加し、既存default exportsを維持する。
- [ ] ResultMeta helperはhomepageまでとし、secret-bearing request URLを受け取らない。
- [ ] fetchPolarityEvidenceがreviewsとselection statsを返す内部型へ変える。
- [ ] balanced sample caveatをinstructionにも短く含める。
- [ ] reviewStats母集団比率とsample比率を別fieldとして扱う。

### Gate and commit

- [ ] pnpm test
- [ ] pnpm test:live
- [ ] pnpm build
- [ ] Commit: feat: traceable provenance and explicit persona sampling limits

---

## Task 6: Prompt argumentsとdomain-scoped recipes

### Files

- Create: src/prompts.ts
- Create: src/prompts.test.ts
- Modify: src/index.ts
- Modify: src/index.test.ts
- Modify: skills/run-sim.md
- Modify: skills/ui-blind-compare.md

### run-sim args

- target required
- topic required
- mode optional baselineまたはchange
- domains optional comma-separated gameplay、storefront、ui、price、localization、competition、またはauto
- specification
- uiUrl
- currentState
- proposal
- competitors
- market
- language
- qualityTier

### ui-blind-compare args

- targetImageId required
- referenceImageIds required comma-separated
- context optional
- qualityTier optional

### Tests first

- [ ] prompt listが引き続き2件。
- [ ] run-sim schemaでtargetとtopicがrequired。
- [ ] invalid mode、unknown domain、50k超specificationをrejectする。
- [ ] getPrompt resultへrecipeと明確に区切ったinput JSONが入る。
- [ ] user input内のMarkdownやinstructionをrecipe本文と混同せずdata blockへserializeする。
- [ ] changeでcurrentStateまたはproposal不足なら先に質問する指示が入る。
- [ ] domains=price,competitionでUI captureとUI gateがN/Aになる。
- [ ] domains=uiでget_artifact imageとblind compare手順が入る。
- [ ] subagent非対応時のsequential independent passが明記される。
- [ ] ui-blind-compareがimage IDsをget_artifactで読む手順を含む。
- [ ] qualityTier未指定時にAAAを勝手なdefaultにしない。

### Implementation

- [ ] Zod prompt schemasとpure prompt buildersをsrc/prompts.tsへ置く。
- [ ] argsはMCP prompt protocolに合わせstringだけを使う。
- [ ] domains parserは重複除去しcanonical orderへする。
- [ ] skills filesを唯一のrecipe sourceとして読み、builderが入力を追記する。
- [ ] archiveはclient-side extraction requiredと明記する。

### Gate and commit

- [ ] pnpm test -- src/prompts.test.ts src/index.test.ts src/knowledge-content.test.ts
- [ ] pnpm build
- [ ] Commit: feat: scoped simulation prompts with explicit user inputs

---

## Task 7: Canonical templateとrubricのuser-facing修正

### Files

- Modify: knowledge/templates/adoption-eval.md
- Modify: knowledge/rubrics/harsh-critic.md
- Modify: src/knowledge-content.test.ts

### Required content changes

- baseline modeは現状単独、change modeだけ現状vs変更案。
- Selected DomainsとN/A理由をレポート冒頭へ記録。
- UI scope外ではUI gateを不合格理由にしない。
- qualityTierに相応しい出荷済み製品を比較対象にし、AAA固定を廃止。
- balanced persona sampleを市場比率として使わない。
- Flow sizeはreviewStats、owners caveat、外部根拠を必要とする。
- SteamSpy ownersはsalesでなくestimate。
- reported-zero、missing、estimatedを区別する。
- Evidence Indexへartifact relative path、observedAt、sourceを記録。
- 最終勧告にconfidenceとnext validationを追加。

### Tests first

- [ ] templateにmode、Selected Domains、N/A、Evidence Index、confidence。
- [ ] rubricにrepresentative false、population ratio、SteamSpy estimate caveat。
- [ ] UI gateがselected domain条件付き。
- [ ] AAA固定文言が消えqualityTier基準が入る。
- [ ] run-simがsave_artifact、get_artifact、steam_discoverを使用する。
- [ ] output completion criteriaがevaluation relative pathを要求する。

### Gate and commit

- [ ] pnpm test -- src/knowledge-content.test.ts src/prompts.test.ts
- [ ] Commit: docs: scope evidence rubric to real user consultation modes

---

## Task 8: 11-tool MCP assembly

### Files

- Modify: src/index.ts
- Modify: src/index.test.ts
- Add or modify service adapters for artifacts and images

### Tool schemas

steam_discover:

- kind、value required
- limit optional 1〜50

save_artifact:

- artifact discriminated by kind intelまたはevaluation
- overwrite optional

get_artifact:

- kind required: intel、evaluation、capture、ui-reference
- target optional
- id optional

### Tests first

- [ ] listToolsがexactly 11 names。
- [ ] 全tool output schemaがdata、warnings、optional metaを持つ。
- [ ] steam_discover input bounds。
- [ ] save_artifact intelとevaluationのMCP round-trip。
- [ ] get_artifact target一覧、item一覧、JSON、Markdown。
- [ ] get_artifact captureとui-reference resultにImageContentがある。
- [ ] ui_capture success resultにtext、structuredContent、ImageContentがある。
- [ ] image too largeはtool success、metadata、warning、ImageContentなし。
- [ ] traversal、invalid kind/input combination、overwrite violationはtool error。
- [ ] 既存save_personaからget_knowledge round-tripを維持。
- [ ] existing 8 tool input contractsをsnapshot比較する。

### Implementation

- [ ] ResultEnvelopeSchemaへoptional metaを追加する。
- [ ] jsonEnvelopeをtext-only result用に維持する。
- [ ] imageEnvelope helperで同じstructuredContentにImageContentを追加する。
- [ ] get_artifactのkind別runtime rulesをtool descriptionへ明記する。
- [ ] startup時にartifact storeとimage readerを組み立てる。
- [ ] stdoutへbase64以外のdiagnosticを出さない。

### Gate and commit

- [ ] pnpm test -- src/index.test.ts
- [ ] pnpm build
- [ ] pnpm smoke:stdio
- [ ] Commit: feat: wire user-complete 11-tool MCP workflow

---

## Task 9: README、migration、end-to-end gates

### Files

- Modify: README.md
- Modify: scripts/smoke-stdio.ts
- Modify: docs/superpowers/specs/2026-08-10-steam-user-sim-design.md
- Modify: docs/superpowers/plans/2026-08-10-steam-user-sim.md
- Test: live and stdio smoke files

### README requirements

- 汎用MCP clientの必須能力: tools、prompts、ImageContent。
- local filesystemとsubagentはoptional。
- client enable、restart、pnpm smokeによる確認手順。
- GUI clientへshell exportが継承されない場合の設定注意。
- baseline価格相談とUI変更相談のprompt input例。
- 11 tool表とsave/get artifactのlist/read semantics。
- artifact layoutとoverwrite default false。
- zipはclient-side extraction。
- samplingはrepresentativeではない。
- SteamSpy estimate caveat。
- v1からv1.1の互換性と追加field。

### Smoke changes

- [ ] stdio serverが11 tools、2 promptsを返す。
- [ ] run-sim prompt schemaとarguments付きgetPrompt。
- [ ] get_knowledge canonical template。
- [ ] get_artifactのread-only list。
- [ ] --liveでsteam_searchとsteam_discover。
- [ ] protocol errorとstdout汚染なし。
- [ ] smokeはrepo artifactを作成・削除しない。

### Final gates

- [ ] pnpm build
- [ ] pnpm test
- [ ] pnpm smoke:stdio
- [ ] pnpm test:live
- [ ] pnpm smoke:stdio --live
- [ ] OBSCURA_PATHありならlocalhost captureがImageContentを返す。
- [ ] OBSCURA_PATHなしならmanual ui-reference案内。
- [ ] ITAD keyあり・なし双方のtimeline contract。
- [ ] git diff --check
- [ ] worktreeにtest artifactが残らない。

### Documentation updates

- [ ] v1 designへv1.1 design linkとsuperseding decisionsを追加する。
- [ ] 旧v1 planは冒頭にactive v1.1 planへのpointerだけ追加し、既存の完了checkboxと本文は変更しない。
- [ ] 過去CCU、npm bin、remote deploymentはv1.2以降へ明示的に再配置する。

### Commit

- [ ] Commit: docs: complete v1.1 user workflow and verification guide

---

## Definition of done

- 汎用MCPクライアントがlocal filesystem toolなしで過去evaluationを読み、新規evaluationを保存できる。
- ui_captureまたはget_artifactから実PNGがImageContentとして届く。
- 既知競合がなくてもtag/genreから候補を作れる。
- balanced persona sampleを母集団比率として誤用しないmeta、prompt、rubricが揃う。
- 価格・ローカライズ相談がUI画像なしで正常完了できる。
- baselineとchangeの出力形式が混ざらない。
- 既存8 tool clientがdata、warningsをそのまま利用できる。
- 11 tools、2 prompts、artifact persistence、image deliveryをin-memoryとstdioで検証済み。

上記はimplementation Definition of Doneである。product workflowのdogfood validationは[dogfood data policy](../../dogfood/README.md)で別に追跡し、最低3件の保存済み実相談、1件のUI quality-gap、1件の別session replay auditを完了条件とする。
