# GamePlayerLens

Steam の実データに接地したゲーム開発コンサル用 MCP サーバーです。UI・ゲームシステム・価格・ローカライズを変えるたびに相談できる「変更の右腕」として、競合探索、根拠収集、ペルソナ素材生成、評価保存、過去相談の再読込を generic MCP client から完結できます。

## まず何をしたいですか

| 目的 | 入口 | 最初に渡すもの |
|---|---|---|
| 自作ゲームの企画・prototype・変更案を相談する | `run-sim` | `subjectKind=developer-concept`または`developer-project`、`target`、`topic`、`market`、Steam language codeの`language`、`projectBrief`。必要に応じて`conceptTest`、`firstContactTest`、playtest情報 |
| 公開済みゲームを素早く診断する | `steam_search` → `steam_brief` | ゲーム名またはappid、Steam language code、国コード |
| 公開済みゲームの競合・価格・レビュー・更新を深掘りする | `run-sim` | `subjectKind=existing-game`、`target`、`topic`、`market`、`language`。appidが不明でも名前から開始可能 |
| 過去の相談や保存根拠を読み返す | `get_artifact` | `kind`。まずtarget一覧、次にitem一覧、最後に本文を読む |

接続後は引数なしの`get_status`で、保存先が書込可能か、ITAD価格履歴とObscura page captureが設定済みかを確認できます。返すのは状態だけで、秘密値や絶対pathは返しません。`run-sim`では`subjectKind`を`existing-game / developer-concept / developer-project`から指定します。`intakeDiagnostics.status`が`needs-input`なら、クライアントは`missingFields`を一度に確認してから根拠収集を始めます。開発中対象ではrouteに必要な`projectBrief.<field>`もgateし、`ready`は入力準備の完了だけを表します。

## 現在できること

GamePlayerLensは、外部データと開発者の入力を集めるだけでなく、「どの判断を根拠付きで行えるか」「何が不足しているか」「次に何を検証するか」までを一つの相談履歴として扱います。

| 段階 | できること | 主な出力 |
|---|---|---|
| 理解する | 公開ゲームのstore・地域価格・レビュー・更新・現在値・競合候補を調べる | `steam_brief`、source別provenance、supported decisions、gaps |
| 構造化する | 自作ゲームのtarget player、core action、system response、reward、差別化、開発制約を整理する | Project Brief diagnostics、Core Experience Map |
| 比較する | gameplay、storefront、UI、price、localization、competitionを、同じ条件の競合・referenceと比較する | Data Coverage Matrix、領域別所見、UI quality gap |
| 観測する | concept、第一印象、単発playtest、複数session cohortの結果を、匿名・時系列・変更条件付きで診断する | Concept Test Trace、First-contact trace、Action → response log |
| 判断する | 問題仮説、最小変更、対象persona、success signal、guardrail、再確認条件をまとめる | Decision Card、Prioritized Backlog |
| 学習する | 取得原本、persona、評価、simulation run、実験spec・measurement・outcomeを保存して再検証する | exact-save artifact、immutable run、integrity report、experiment decision |

実際の助言文は`run-sim`などのMCP promptを取得したクライアント側モデルが作ります。MCPサーバーは、入力検証、外部取得、根拠の正規化、保存、coverage・integrity・実験判定を担当し、server-side LLMは持ちません。

## 現在できないこと

- 実build、recording、input logなしに、gameplayの面白さ、操作感、内部ロジックの正しさを断定すること。
- 少数のSteam review、SteamSpy推定値、単発playtestから、母集団の割合、販売本数、market share、retention、conversionを推定すること。
- static画像だけからmotion、latency、controller feel、未表示stateを評価すること。
- 変更と結果の因果効果を、事前登録した比較条件と実測なしに証明すること。
- Game UI Databaseなどの認証・robots・利用条件・download制限を回避してbulk取得すること。
- クライアントにbrowser / desktop controlがない状態でゲームを直接操作すること。
- telemetryの自動取込、実験scheduler、汎用統計engineとして動作すること。

## 現在の成熟度

| 機能 | 現在地 | 残る検証 |
|---|---|---|
| 公開Steamゲームの取得・初回診断 | Hades固定live API、stdio、配布package、exact-saveまで検証済み | 別規模・別genre・新作での継続dogfood |
| 既存ゲームの根拠付き相談 | 保存済み実相談、replay audit、UI quality-gapまでdogfood済み | 実案件を増やした勧告精度の比較 |
| 自作ゲームのstructured Project Brief | schema、prompt、intake、stdio、package smokeを検証済み | 実在する開発中ゲームでのend-to-end dogfood |
| concept / first-contact test | 入力検証、匿名化境界、exact-save、記述診断を検証済み | 実際の第三者testによる反復検証 |
| playtest session / cohort | protocol、retest比較、synthetic transportを検証済み | 操作可能な実buildでの継続test play |
| prospective experiment | spec・measurement・outcome、hash chain、server decisionを検証済み | 実buildの予測→測定→次のspecという完全loop |

したがって現時点で最も強い用途は、公開済みゲームの調査と根拠管理です。次に検証価値が高いのは、実在する開発中ゲームについて一つの判断を選び、Project Briefから実buildまたは第三者testまでを通すことです。

## クライアント要件

必要なクライアント能力は次の3つです。

- MCP tools を呼べる
- MCP prompts を取得できる
- 標準 MCP `ImageContent` を表示するかモデルへ渡せる

ローカル filesystem tool、subagent、独自の画像読取 tool は任意です。subagent がなければ、同じモデルが領域ごとの independent pass を順番に実行できます。browser/desktop controlを持つclientはHTTP(S) buildを実際にtest playでき、持たないclientはユーザー実行のrecording、連続capture、input logを根拠にします。v1.1 が直接受ける対象入力は仕様テキストと HTTP(S) URL です。zip はクライアント側で展開し、必要なテキストを prompt の `specification` などへ渡してください。サーバーはzip、任意のローカル実行file、credentialを受け取りません。

## 必要環境とセットアップ

- Node.js 20 以上
- pnpm 10 以上
- リポジトリルートからの実行

```bash
pnpm install
pnpm build
```

リポジトリ同梱の `.mcp.json` は `pnpm tsx src/index.ts` で stdio server を起動します。対応クライアントでこのリポジトリを開き、`game-player-lens` MCP server を有効にしてからクライアントを再起動してください。環境変数や `.mcp.json` を変えた場合も再起動が必要です。

### npm `bin`として使う

配布用packageは、リポジトリルートで次のように作成・インストールできます。

```bash
pnpm pack
npm install --global ./game-player-lens-0.1.0.tgz
game-player-lens
```

MCPクライアントからは次の設定で起動します。

```json
{
  "mcpServers": {
    "game-player-lens": {
      "command": "game-player-lens"
    }
  }
}
```

配布版CLIはcanonical template、rubric、recipeをnpm packageから読み、生成するpersona、intel、capture、evaluation、simulation runをデフォルトで `~/.game-player-lens/` に保存します。保存先を変える場合は、MCP server環境へ絶対パスの `GAME_PLAYER_LENS_HOME` を設定してください。インストール先の `node_modules` にはユーザーデータを書きません。

接続確認はリポジトリルートで実行します。

```bash
pnpm build
pnpm smoke:stdio
pnpm smoke:stdio --live
```

`pnpm smoke:stdio` は dist の実 stdio 接続越しに、exactly 14 tools、2 prompts、safe status、prompt arguments、intake診断、playtest protocolの値往復、canonical knowledge、evaluation/run の read-only artifact list、protocol の正常終了を検証します。package smoke は分離data homeで synthetic playtest protocol fixture（実ゲーム操作ではない）とpersona・evaluationを作り、gameplay simulation runの封印、構造coverage、canonical seal、全dependencyのintegrity readbackまで確認します。`--live` はさらに `steam_search`、`steam_brief`の50 KiB first-pass budget、`steam_discover`、`derive_personas`のgeneration readiness、`steam_updates` とresultHandle原本保存を実 API で確認します。サーバー stdout は JSON-RPC 専用で、診断は stderr に出ます。

## 任意設定

外部キーとバイナリはどちらも任意です。未設定でもサーバーは起動し、該当 tool が取得手順を `warnings` に返します。空文字は未設定として扱います。`GAME_PLAYER_LENS_HOME` は配布版CLIの保存先設定であり、外部連携には使用しません。

```bash
export ITAD_API_KEY="your-isthereanydeal-api-key"
export OBSCURA_PATH="/absolute/path/to/obscura"
export GAME_PLAYER_LENS_HOME="/absolute/path/to/player-research-data"
```

- `ITAD_API_KEY`: IsThereAnyDeal の Steam 価格履歴に使用します。キーは [ITAD Apps](https://isthereanydeal.com/apps/my/) で作成します。
- `OBSCURA_PATH`: [Obscura](https://github.com/h4ckf0r0day/obscura) の実行ファイルです。localhost/loopback capture は `--allow-private-network` 対応の v0.1.6 以降を使用してください。未設定または capture 失敗時は `knowledge/ui-references/` への手動配置を案内します。
- `GAME_PLAYER_LENS_HOME`: npm `bin`実行時の可変データ保存先です。絶対パスだけを受け付け、未設定時は `~/.game-player-lens/` を使います。repo内から直接起動する場合は従来どおりrepo-local layoutを使います。

GUI クライアントは terminal の `export` を継承しない場合があります。その場合はクライアント自身の MCP server 設定へ環境変数を設定し、クライアントを完全に再起動してください。外部連携の設定項目は `ITAD_API_KEY` と `OBSCURA_PATH` の2つだけです。`.mcp.json` に空の env 値は書かず、利用できる場合は親プロセスの環境を継承します。

### 外部endpoint障害

Steam Store、Steam Reviews、Steam News、SteamSpy、ITADのJSON取得は、短い429・408・425・5xx、接続瞬断、一時的なinvalid JSONだけを最大2回試行します（再試行は1回）。`Retry-After`が1秒を超える場合はMCP呼び出し内で待ち続けず、待機秒数をwarningへ返します。timeoutは同じ長い待ちを繰り返さず、そのsourceを`null`または`unavailable`として返します。JSON responseは8 MiBで打ち切り、warningにはresponse body、request URL、query、keyを含めません。

`steam_brief`は各sourceを独立して扱うため、1 endpointが例外をthrowしても、取得済みのstore、review、updateなどを失いません。`provenance.status`、`readiness.gaps`、`nextActions`で不足範囲を確認してください。SteamSpyの複数条件intersectionは、1条件でも取得できなければ候補を捏造せず全体をunavailableにします。Steam画像とObscura page captureは失敗時に不完全な画像を保存せず、`knowledge/ui-references/`への手動配置手順を返します。

## Prompts と相談例

- `run-sim`: 対象理解、競合選定、persona 派生、領域別評価、批評、レポート保存までの実行レシピ
- `ui-blind-compare`: 対象 UI と参照 UI を匿名化し、正解開示前に評価を固定する比較レシピ

基本の入口は `run-sim` です。prompt arguments はすべて string です。クライアントの prompt UI で、たとえば次の値を渡します。

自作ゲームのprototype相談では、`projectBrief`へJSON文字列を渡すと、企画意図を自由文から分離できます。

```json
{
  "target": "Project Nyx",
  "topic": "Prototype core and next milestone",
  "subjectKind": "developer-project",
  "mode": "baseline",
  "domains": "gameplay,storefront,competition",
  "projectBrief": "{\"revisionId\":\"brief-v3\",\"developmentStage\":\"prototype\",\"conceptOrigin\":\"theme-first\",\"targetPlayer\":\"読みやすいrisk判断を好むroute-planning player\",\"themeWorld\":\"嵐の中で配達網を守る飛行船郵便局\",\"distinctiveSystem\":\"変化する予報に対して航路を描き直す\",\"repeatedAction\":\"予報を読み、航路を決め、結果から立て直す\",\"playerDecision\":\"安全性と配達価値のどちらを優先するか\",\"systemResponse\":\"風、燃料、荷物の状態が即座に変わる\",\"rewardMechanisms\":[{\"family\":\"mastery\",\"form\":\"mixed\",\"beforeState\":\"安全な航路がまだ分からない\",\"playerAction\":\"予報を読み航路を確定する\",\"systemResponse\":\"風、燃料、荷物が選択へ反応する\",\"afterState\":\"航路予測の成否が判明する\",\"perceivedReward\":\"読みが成立し配達を完了できる手応え\",\"amplifier\":\"嵐の音、機体animation、受取人の反応\"}],\"oneSentencePromise\":\"嵐を読み切り、小さな空の郵便網を守る\",\"knownFrame\":\"route-planning management\",\"sourceAction\":\"制約を読みながら経路を選ぶ\",\"sourceSystemResponse\":\"選んだ経路に応じて時間と資源が変わる\",\"sourceReward\":\"計画が成立して効率が改善する手応え\",\"meaningfulDifference\":\"予報の不確実性を航路として描き直せる\",\"teamCapacity\":\"開発2名、音楽はpart-time\",\"runwayMonths\":14,\"nextIrreversibleCommitment\":\"Steam coming-soon pageの公開\"}",
  "competitors": "既知なら作品名、未知なら省略",
  "market": "Japan",
  "language": "japanese"
}
```

`projectBrief`は開発者が宣言した設計意図です。`conceptOrigin`は`theme-first / system-first / holistic-image / imitation`のいずれかで、優劣ではなく次に確認する不足counterpartを選ぶために使います。報酬は`rewardMechanisms`へ1〜6件、family、`inherent / transition / mixed`、before state、player action、system response、after state、perceived reward、任意のamplifierに分けます。`knownFrame`を使う場合は、参照作品で想定する体験を`sourceAction`、`sourceSystemResponse`、`sourceReward`へ分け、target側の差を`meaningfulDifference`へ書きます。いずれもplayer evidenceとは扱わず、source asset、build、third-party理解test、human playtest、telemetryで順に検証します。promptの`projectBriefDiagnostics`は`conceptRoute`、`rewardMechanism`、`mechanismTransfer`を返しますが、field数やstatusはquality scoreやmilestone passではありません。

第三者へ短いpitchやmockupを見せた結果は、`conceptTest`へJSON文字列として渡せます。次はJSON文字列へencodeする前の形です。

```json
{
  "testedAt": "2026-08-12T10:00:00+04:00",
  "stimulusId": "pitch-card-v3",
  "parentStimulusId": "pitch-card-v2",
  "changeSummary": "Repeated actionを1つに絞り、直後のrewardを明記した",
  "changedVariables": ["presentation"],
  "invariantsKept": ["同じ対象player、質問、提示時間"],
  "projectBriefRevision": "brief-v3",
  "promiseShown": "嵐を読み切り、小さな空の郵便網を守る",
  "stimulusDescription": "One-sentence promise plus one gameplay mockup",
  "exposureProtocol": "Show for 30 seconds, then remove before questions",
  "recruitment": "External players recruited from a tactics community",
  "targetPlayerDefinition": "Players who enjoy deliberate route planning",
  "questionsAsked": [
    "What would you do repeatedly?",
    "What would feel rewarding?",
    "Would you choose to try it? Why?"
  ],
  "participants": [
    {
      "participantId": "p-01",
      "targetFit": "high",
      "understoodAction": "yes",
      "understoodReward": "unclear",
      "interest": "maybe",
      "unaidedSummary": "I would redraw routes around storms",
      "confusions": ["The long-term goal was unclear"]
    }
  ],
  "deviations": []
}
```

`participantId`は重複しない仮名IDだけにし、氏名、email、連絡先などの個人情報を入れません。schemaが自動拒否する個人情報はemail形式だけであり、氏名、電話番号、住所、アカウントIDなどは送信前に利用者が除去してください。promptは行動理解、報酬理解、興味を別々に件数集計し、`teachBackAudit`でyes判定と`unaidedSummary`の有無も分けます。`revisionId` / `projectBriefRevision`と`oneSentencePromise` / `promiseShown`の完全一致だけをprovenanceとして示し、意味的な一致や品質scoreは推定しません。この少人数sampleから固定合格率、conversion、purchase、需要も推定しません。

再検証では新しい`stimulusId`と一緒に`parentStimulusId`、`changeSummary`、`changedVariables`、`invariantsKept`をすべて渡します。親revisionを指定して比較設計の一部を省略した入力は拒否されます。診断はprotocol deviation、測定不足、action / rewardの読みにくさ、参加者の混乱を次に調べる候補として返しますが、原因とは断定しません。効果を比較したい場合は一度に変えるcoreまたはasset変数を1つに絞り、複数を変えた結果の因果は`unresolved`として残します。単一変更でも、維持条件は自己申告なので因果証明ではなく比較候補です。

インディー戦略の出力では、テーマ固有のplay、theme-system fit、experience → reward、第三者のunaided teach-backを別々に扱う`Core Legibility Gate`、変更と維持条件を追う`Core Revision Ledger`、実際の第一viewport・screenshots・trailerで即離脱リスクを見る`First-contact Asset Readiness`を作ります。「最初の4枚」「30秒」などの固定数は合格条件にせず、現在の表示contextとtarget playerの証拠で判断します。AI生成や自動化は制作速度の補助であり、人間のfunやtaste fitの証明にはしません。

concept test入力時は、promptに`conceptTestEvidence.resultHandle`が自動追加されます。レシピはこのhandleだけを`save_artifact(kind=intel)`へ渡すため、モデルによる転記・要約を挟まず、正規化済み入力と`testedAt`をそのまま保存できます。field-level validation errorは許可済みfield名と違反種別だけを返し、拒否した入力値や未知field名は表示しません。

第一viewport、screenshots、trailerなどを第三者へ見せた結果は`firstContactTest`へ渡せます。asset ID / type、device・viewport・duration・sound・表示順、募集条件、匿名participantごとの`visualQuality`、theme / action / reward理解、`immediateReject`を別々に保存・診断します。`rough`または`style-mismatch`には`visualQualityReason`が必須です。promptに追加される`firstContactTestEvidence.resultHandle`で原本をexact-saveし、少人数の反応をconversion、需要、fun、客観的な制作品質scoreへ変換しません。

次はJSON文字列へencodeする前の例です。

```json
{
  "testedAt": "2026-08-12T11:00:00+04:00",
  "assetId": "store-viewport-v2",
  "parentAssetId": "store-viewport-v1",
  "changeSummary": "最初にcore actionのproof momentを表示した",
  "changedVariables": ["presentation"],
  "invariantsKept": ["同じ対象player、質問、device、表示時間"],
  "assetType": "store-viewport",
  "assetDescription": "scroll前のSteam第一viewport",
  "exposureContext": {
    "device": "desktop",
    "viewport": "1440x900",
    "durationSeconds": 20,
    "sound": "not-applicable",
    "orderDescription": "通常のSteam表示順"
  },
  "recruitment": "route-planning好きの外部player",
  "targetPlayerDefinition": "慎重なroute判断を好むplayer",
  "questionsAsked": [
    "どんな世界だと思いましたか？",
    "何を繰り返すゲームだと思いましたか？",
    "何が報酬になりそうですか？",
    "すぐ離脱したくなる点はありましたか？"
  ],
  "participants": [{
    "participantId": "p-02",
    "targetFit": "high",
    "visualQuality": "rough",
    "visualQualityReason": "route overlayがこのviewportでは未完成に見える",
    "understoodTheme": "yes",
    "understoodAction": "unclear",
    "understoodReward": "no",
    "immediateReject": "yes",
    "unaidedSummary": "嵐の配達ゲームだが操作は分からない",
    "rejectionReason": "遊べるactionが画面に見えない",
    "confusions": ["何を操作するか"]
  }],
  "deviations": []
}
```

個人開発の企画理解だけを相談する場合は、`projectBrief`と`conceptTest`を中心に最小scopeを選べます。Steam公開済み対象、価格、競合、UI、実操作buildの判断が不要なら、その理由をN/Aとして残し、不要な外部取得を増やしません。ただしpersonasやimmutable runを作る完全評価には保存可能な対象・競合作品のplayer evidenceが必要です。不足時は概念診断を途中成果として返し、取得していない市場・プレイ結果を埋めません。

価格の baseline 相談:

```json
{
  "target": "Project Nyx",
  "topic": "Japan launch price",
  "mode": "baseline",
  "domains": "price,competition",
  "specification": "Premium roguelike。想定プレイ時間20時間。日本価格は未決定。",
  "competitors": "Hades, Dead Cells",
  "market": "Japan",
  "language": "japanese",
  "qualityTier": "premium indie"
}
```

UI の change 相談:

```json
{
  "target": "Project Nyx",
  "topic": "Inventory navigation redesign",
  "mode": "change",
  "domains": "ui",
  "uiUrl": "http://127.0.0.1:4173/inventory",
  "uiBenchmarkTask": "Controllerでinventoryを開き、武器性能を比較して装備する",
  "uiReferenceUrls": "https://www.gameuidatabase.com/\nhttps://interfaceingame.com/screenshots/",
  "currentState": "Tabs are text-only across the top; item details open in a modal.",
  "proposal": "Replace tabs with a left icon rail and persistent right-side details.",
  "competitors": "Hades II, Dead Cells",
  "qualityTier": "premium indie"
}
```

`mode=change` では `currentState` と `proposal` が必要です。不足時は評価開始前に確認質問を行う recipe になります。`domains` は `gameplay,storefront,ui,price,localization,competition` の comma-separated list または `auto` です。`uiReferenceUrls` は改行またはcomma区切りのcredentialなしHTTPS URLを最大8件受け、重複とfragmentを除去します。UI が scope 外なら capture、blind compare、UI gate は N/A であり、不合格理由にはなりません。

### 分析できる範囲

| Domain | 根拠付きで扱う内容 | 断定しない境界 |
|---|---|---|
| `gameplay` | コアループ、目標、進行、失敗→再挑戦、継続動機 | tagsやレビューだけでは内部コード・状態遷移・数式の正しさを断定しない |
| `storefront` | 英/日/独のrequested-locale copy、価値提案、screenshots、Steam Sonar dashboard、競合との期待差 | Steam fallbackの可能性を残し、未取得リンク先を根拠扱いしない |
| `ui` | matched cohortに対するtask clarity、階層、可読性、密度、状態、入力feedback、accessibility、production finishの軸別gap | static画像だけでmotion・latency・controller feel・未表示stateを断定しない |
| `price` | US/JP/DE現在価格、値引き、任意のITAD履歴、購入タイミング | 現在価格から過去傾向を推測しない |
| `localization` | 対応言語、localized store copy、対象言語レビュー、ゲーム内capture | 対応言語一覧だけで翻訳品質・文化適合・フォント品質を断定しない |
| `competition` | tag交差、同一項目のstorefront/gameplay proxy/価格/review比較 | tag一致だけを最終的な類似性としない |

### Data coverage と分析精度

Selected Domainごとに固定dimensionを持つData Coverage Matrixを作り、`observed`、`reported-zero`、`estimated`、`missing`、`N/A`を区別します。`Coverage rate`は推定を含む取得充足率、`Direct observation rate`は直接観測と明示的な0だけの比率です。どちらも成功確率ではなく、blocking dimensionがmissingなら平均値が高くてもconfidenceをhighにしません。固定dimensionと計算規則は`get_knowledge(kind=rubrics, id=evidence-coverage.md)`で取得できます。

change runは全`scenario × Selected Domain`と全`persona × scenario`のroundを要求します。final evaluation以外の全evidenceは少なくとも1 roundで使用し、synthesis後に作る`finalEvaluationRef`をroundから参照する循環は拒否します。これにより「変更案だけ評価した」「保存したが判断に使わなかった」データをmachine gateで検出します。

### インディーゲーム生存戦略

企画、prototype、store公開、demo、Next Fest、launch、post-launchの相談では、購入前の`Appeal Promise`と購入後の`Delivered Experience`を別ledgerで評価します。`Core Experience Map`でtheme、distinctive system、反復行動、player decision、system response、即時報酬・変化の報酬を結び、`Concept Origin Route`で企画の起点から不足側を特定し、`Reward Mechanism Trace`でbefore state → action → response → after stateを追います。`Promise-Delivery Trace`ではcapsule / trailer / copyが約束した体験をbuild momentとplaytestへ接続します。競合作品は`Mechanism Transfer Map`でsurface featureとsourceのaction → response → rewardを分け、`Known Frame`から理解costを下げつつ、targetのaction / decision / rewardを変える`Meaningful Difference`へ転用します。

市場側は`impression → store visit → wishlist → demo start → demo completion → purchase → retained play`として観測し、wishlistを面白さ、販売本数、Steam visibilityの単独証明にしません。milestoneは日付だけでなくplayer / asset evidenceでgateし、Next Fest等の条件は[公式Steamworks](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)の現在仕様を実行時に確認します。販売本数、platform fee、refund、税、conversion、開発期間は固定値を埋めず、project固有のteam capacity、cost、契約、法域、runwayをconservative / base / upside scenarioへ分離します。

詳細な判断境界は`get_knowledge(kind=rubrics, id=indie-survival-strategy.md)`で取得できます。

### 更新戦略と意思決定結果

既存ゲームの更新判断では`steam_updates`がSteam公式`ISteamNews/GetNewsForApp/v2`を使い、公式Community Announcementから更新履歴を返します。既定の`updates` scopeはSteamの`patchnotes` tagまたはboundedなtitle keywordだけでupdate-like項目を選び、本文中の単語だけでは選びません。分類語彙はSteamSonarの`major / content / balance / fixes / event / demo / localization / sale / community / general`を踏襲し、`updateEvidence`、`updateConfidence`、`typeConfidence`、`classificationBasis`、`platformHints`、highlights、取得範囲、更新間隔中央値、SteamSonar dashboard linkを保持します。

`patchnotes` tagによる選定はSteam由来、titleによる選定とtypeはheuristicです。種類の確度と「更新らしさ」の確度を混ぜません。`platformHints`はtitleに明記されたSwitch、mobile、Mac、Steam Deckなどを示し、Steam build更新の証明ではありません。更新頻度や最終告知日だけで品質、開発速度、放置、売上、retention効果を断定しません。レポートはDecision Card、Update inventory、Persona Update Impact Matrix、Prioritized Update Backlogを使い、`fix-now / test-next-build / investigate / defer`、最小変更、success signal、guardrailを明示します。詳細は`get_knowledge(kind=rubrics, id=update-strategy.md)`で取得できます。

### 実buildのtest play

`run-sim`へ`playtestUrl`、`playtestTask`、`playtestBuild`、`playtestControls`、`playtestDurationMinutes`を渡せます。完了した1 sessionは`playtestSession`へ渡すと、build / task / controlsの照合、時系列Action → system response → rewardSignal、friction、人間の任意`humanReport`を分離して診断します。promptの`playtestSessionEvidence.resultHandle`で原本をexact-saveでき、1 sessionをfun score、completion rate、retention、需要へ変換しません。gameplayを選択した相談では`get_knowledge(kind=rubrics, id=playtest.md)`のprotocolを使います。

browser/desktop controlを持つAI clientでは実buildを操作します。操作能力がない場合はページ閲覧をtest playと呼ばず、recordingまたはユーザー同席sessionへ切り替えます。AI 1 testerは再現可能な操作摩擦の発見には使えますが、人間の楽しさ、需要、completion rate、retentionの代表ではありません。native buildの任意実行はMCP server自身では行いません。

```json
{
  "target": "Project Nyx",
  "topic": "First 20 minutes playtest",
  "mode": "baseline",
  "domains": "gameplay,ui",
  "playtestUrl": "http://127.0.0.1:4173/play",
  "playtestTask": "Start a new run, understand the first objective, defeat the tutorial enemy, and retry once after failure",
  "playtestBuild": "0.4.2-dev",
  "playtestControls": "keyboard and mouse",
  "playtestDurationMinutes": "20"
}
```

完了後は次の形をJSON文字列へencodeして`playtestSession`に渡します。`participantId`は仮名IDだけを使います。

```json
{
  "startedAt": "2026-08-12T12:00:00+04:00",
  "endedAt": "2026-08-12T12:08:00+04:00",
  "sessionId": "playtest-build-042-p04",
  "buildId": "0.4.2-dev",
  "platform": "Windows 11 desktop",
  "controls": "keyboard and mouse",
  "task": "Start a new run and defeat the tutorial enemy",
  "startState": "Fresh save at the title screen",
  "endState": "Tutorial enemy defeated",
  "testerType": "human-participant",
  "participantId": "p-04",
  "targetFit": "high",
  "observationSource": "moderated",
  "priorKnowledge": "storefront-only",
  "observations": [
    {
      "step": 1,
      "elapsedSeconds": 95,
      "eventType": "reward",
      "meaningfulAction": true,
      "playerIntent": "Parry the enemy attack",
      "inputAction": "Pressed parry after the attack flash",
      "systemResponse": "Enemy staggered, but the success sound was masked by music",
      "expectedDifference": "Expected an unmistakable success cue",
      "frictionSeverity": "material",
      "rewardSignal": "unclear",
      "evidenceIds": ["capture-playtest-002"]
    }
  ],
  "outcome": "completed",
  "humanReport": {
    "feltReward": "unclear",
    "rewardDescription": "The stagger looked useful, but did not feel decisive",
    "wouldRepeat": "maybe",
    "confusions": ["Whether the parry timing was correct"]
  },
  "deviations": []
}
```

改善後のretestでは、47文字以内のlowercase kebab-caseによる新しい`sessionId`に`parentSessionId`、`changeSummary`、`changedVariables`、`invariantsKept`をすべて追加します。diagnosticsが返すartifact IDを使ってsession原本を`playtest-session-<sessionId>`へimmutableに保存し、親原本のtask、platform、controls、start state、tester / cohort、observation sourceと照合します。単一変更でも比較候補であり因果証明ではありません。複数変更は`unresolved-multiple-changes`となります。事前の成功criterion、guardrail、複数scenario集計が必要な比較はExperimentSpecを使います。

2〜20件のsessionをまとめる場合は、完全なsession objectを`sessions`へ入れた`playtestCohort`を使います。`playtestSession`との同時入力は拒否されます。cohortには`assembledAt`、48文字以内のlowercase kebab-case `cohortId`、`purpose`、`recruitment`、`targetPlayerDefinition`、`samplingBoundary`が必要です。原本は`playtest-cohort-<cohortId>`へexact-saveされ、session count、unique human participant、repeat exposure、AI / human、outcome、human report coverage、friction / reward evidence、protocol group、lineageを件数のまま返します。内部parentがあるretestは`retestComparisons`でrecorded protocol、participant exposure、変更変数、outcome / reward / material friction / human reportの前後差を照合します。cohort外parentはexact-readbackまで未解決です。前後差を率、fun score、因果効果、需要予測へ変換しません。

### 継続的な実験loop

変更案をprospectiveに検証するときは、[Discovery Loop](https://www.discoveryloop.com/)のpropose → run → examine → iterateを、GamePlayerLensでは`ExperimentSpec → Prediction Run → ExperimentOutcome → next ExperimentSpec`として扱います。詳細なshapeと判定境界は`get_knowledge(kind=rubrics, id=experiment.md)`で取得できます。

ExperimentSpec、ExperimentMeasurement、ExperimentOutcomeは`save_artifact(kind=intel, sourceTool=manual)`で保存し、`overwrite=true`を渡しません。specは結果を見る前に保存し、Prediction Runのevidenceへ含めます。run readbackのspec evidence SHA-256、run artifact SHA-256、canonical record SHA-256をOutcomeへ記録します。Prediction Runは予測の封印であり、実験実行済みを意味しません。

Outcomeのmetricは`ai-playtest / human-playtest / telemetry / steam-reviews / store-metric / manual-observation`を区別し、source、instrument、unit、aggregation、cohort、windowがspecと一致しない値で登録済みcriterionを満たしません。測定できなかった場合もmissingを0やfailureへ変換せず、`overallVerdict=unresolved`として保存します。次のspecが`parentOutcomeRef`を持ち、次runが新spec、parent outcome、raw measurementのすべてをevidenceとして各analysis phaseで使ったときにloopがつながります。

実験artifactは既存intel storeへ保存しますが、run schema v5は相談時の`subjectKind / market / language / projectBrief`に加え、ExperimentSpec / Measurement / Outcomeをstrict validationします。次runの`simulationReadiness.calibration.serverVerified=true`は、parent ref、spec / Prediction Run / measurementのSHA-256 chain、時刻順、primary protocol、minimum sample、raw valueの再計算がすべて一致した場合だけ返ります。`forecastComparisons`はその1予測の誤差を示します。`experimentDecisions`は全success criterionとguardrailをraw measurementから再計算し、server overall、限定的な`recommendedAction`、client申告との一致を表示します。どちらも因果効果や母集団代表性ではありません。

### UI実力差の比較

UI比較では [Game UI Database](https://www.gameuidatabase.com/) と [Interface In Game](https://interfaceingame.com/screenshots/) などを、出荷済みreference候補の探索に使います。Game UI Databaseのscreen type、controls、HUD elements、layout、texture、patterns、color、font size、icon usage、colorblind visualizer、video flowを比較条件へ使います。ただしcatalog掲載、like数、人気順、ゲーム売上はUI品質の根拠ではありません。

比較前に `uiBenchmarkTask` をplayerの目的・開始状態・完了状態として固定し、同じscreen state、platform、controls、近い情報量、指定qualityTierのreferenceを2〜4本選びます。各referenceはsource page URL、accessedAt、game、screen state、platform、controls、static/video、capture ID、cohort選定理由を `save_artifact(kind=intel, sourceTool=manual)` で保存します。Game UI Databaseの公開APIやbulk scrapingを仮定せず、robots、認証、利用条件、download制限を回避しません。通常page captureが使えない場合は、権利上利用可能な画像を `knowledge/ui-references/` へ手動配置します。

画像は出自を隠してpre-reveal採点を固定し、開示後に8軸の `gap = target score - reference median` を計算します。0〜4はordinal anchorで、未検証軸は0ではなく `unscored` です。`gap <= -1` をmaterial deficitとして優先しますが、conversion、retention、売上の因果効果には変換しません。同じmodelがreference identityを既に見てmemoryを隔離できない場合はblindと称さず、`non-blind structured comparison` としてconfidenceを制限します。詳細な判定境界は `get_knowledge(kind=rubrics, id=ui-quality-gap.md)` で取得できます。

## Tools

現在の tool surface は次の exactly 14 tools です。

| Tool | 用途 |
|---|---|
| `steam_search` | 既知名から Steam appid 候補を検索 |
| `steam_brief` | store、地域価格、任意の価格履歴要約、両極レビュー、現在値、更新、競合候補を1回で収集し、判断可能範囲・欠損・次の取得を返す |
| `steam_fetch` | 3地域価格、英/日/独store copy、categories、画像、Steam Sonar/SteamDBリンク、SteamSpy情報を取得 |
| `steam_reviews` | 言語・極性・最低プレイ時間で recent review を取得 |
| `steam_timeline` | SteamSpy snapshot と任意の ITAD 価格履歴を取得 |
| `steam_updates` | Steam公式更新履歴をSteamSonar互換分類、highlights、cadence、分類根拠付きで取得 |
| `derive_personas` | レビュー出典、Persona JSON Schema、証拠から安全に生成できる件数と生成指示をまとめる |
| `save_persona` | 生成済み persona を検証し、原子的に保存 |
| `ui_capture` | 通常ページをObscuraでPNG capture、またはSteam CDN画像をJPEG保存し、上限内なら `ImageContent` も返す |
| `get_knowledge` | canonical templates、rubrics、personas、互換用 intel を一覧・取得 |
| `get_status` | 保存先の書込可否と任意連携の設定有無を、秘密値や絶対pathを含めず確認 |
| `steam_discover` | SteamSpy のtag/genreを単独検索、または最大4条件で交差して競合候補を取得 |
| `save_artifact` | intel JSON、evaluation Markdown、またはハッシュ付き immutable simulation run を安全に保存 |
| `get_artifact` | intel、evaluation、run、capture、ui-reference を一覧または読出し |

全toolは`{data, warnings, meta?}`を返します。一部の外部取得だけが失敗しても取得済みデータを維持します。`steam_search`、`steam_brief`、`steam_discover`、`steam_fetch`、`steam_reviews`、`steam_timeline`、`steam_updates`、`derive_personas` の1 MiB以下の結果には `meta.resultHandle` も付き、モデルがJSONを再構成せず原本を保存できます。`derive_personas`へ`market`または`language`を直接渡さない場合は互換用のJapan / japanese既定値を適用しますが、audience mismatchを見逃さないようwarningを返します。新しいworkflowでは両方を明示してください。入力違反と path 境界違反は tool error です。

公開済みゲームの初回相談では、appidを解決した後にまず`steam_brief`へ対象言語と国を明示します。取得量を抑えたrecent review抜粋とupdate要約、最上位tagによる競合候補、source別provenance、coverage dimensionを返します。`readiness.supportedDecisions`にない判断は確定せず、`gaps`と`nextActions`に従って必要な個別toolだけを追加してください。briefは実際のbuildを操作しないため、gameplay品質、fun、retention、変更の因果効果を証明しません。

`steam_discover` は `value` を主条件とし、任意の `additionalValues` 最大3件をすべて満たす候補だけを返せます。交差検索は各条件のSteamSpy上位50件を使い、各API順位の合計が小さい順に並べます。対象自身や既知の不適合候補は `excludeAppids` 最大50件で除外します。たとえばHades IIに近い候補は次の入力で探索できます。

```json
{
  "kind": "tag",
  "value": "Action Roguelike",
  "additionalValues": ["Rogue-lite", "Hack and Slash"],
  "excludeAppids": [1145350],
  "limit": 10
}
```

交差時の各候補には `matchedValues` と `sourceRanks` が付きます。これはSteamSpy tagの重なりであり、最終的な類似性保証ではないため、候補は `steam_fetch` で再検証してください。

### `ui_capture`

通常のURLは既定の `sourceType=page` で、従来どおりObscura CDPを使ってPNG captureします。`steam_fetch.screenshots` が返すSteam Store画像は `sourceType=steam-image` を指定すると、ObscuraなしでJPEGを保存して `ImageContent` として読めます。

```json
{
  "url": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145350/example.jpg",
  "name": "hades-ii-store-shot",
  "sourceType": "steam-image"
}
```

直接取得は `https://steamstatic.com` とそのsubdomainだけに限定されます。認証情報、独自port、redirect、JPEG以外、6 MiB超は拒否します。`viewport` と `fullPage` は `sourceType=page` 専用です。Steam SonarやSteamDBなどのHTML dashboardは `sourceType=page` を使います。

### `save_artifact` / `get_artifact`

`save_artifact` は `kind=intel` のとき、取得toolが返した `resultHandle` と `target` / `id` だけを渡すexact saveを推奨します。サーバーが `sourceTool`、`observedAt`、warning、metaを含むpayload原本を引き継ぎます。直接保存で `observedAt` を省略すると、サーバーが `savedAt` と同じ時刻を設定します。result handleは現在のMCP server processにある最近32件のみなので、取得直後に保存してください。`kind=evaluation`ではcanonical templateの必須H2、各非空本文、Indie Survival Strategyの全必須H3または具体的な`適用外:`理由をserver側で検査し、`［...］`が残る未記入templateや短文だけの完了artifactを拒否します。intel と evaluation は `overwrite` の default が `false` で、同じ canonical path の既存ファイルを明示なしに変更しません。

ExperimentSpec / ExperimentMeasurement / ExperimentOutcomeは直接intel方式で保存し、immutabilityのため`overwrite`を常に省略します。run保存時はExperimentSpecのtarget、mode、planned scenarios、primary metric、success criterion、predictionを検証し、runと一致するspecを実際にevidenceとして使った場合だけ`simulationReadiness.status=validation-ready`にします。Outcome evidenceやclient-reported `calibrationStatus=calibrated`だけではserver verifiedになりません。完全なhash chainとraw measurementを検証できた場合だけ`validated-forecast-error`、全criteriaを解決できた場合だけ`verified-experiment-decision`がallowed claimになります。guardrail breachはserver decisionを`stopped`にし、missingは`unresolved`のままです。

`kind=run` は、evaluation 保存後に simulation を再生・監査するためのledgerを封印します。`subjectKind / market / language`、開発中対象ではroute-completeな`projectBrief`、Mode、scenarios、Selected Domains、client-reported model、persona IDs、保存済みevidence、連続した各pass、warnings、confidence、最終evaluation refを受けます。開発中対象の最終evaluationがIndie Survival Strategyを適用外にしている場合は封印を拒否します。サーバーは相談context、各evaluationの`indieStrategyMode`、persona・evidence・recipeのSHA-256、構造coverage、`simulationReadiness`をcanonical sealへ含めます。

`simulationReadiness.status=rehearsal`は、レビュー・persona・比較根拠から問題仮説、反応方向の仮説、次のtest priorityを作れる段階です。母集団代表性と介入分離は未確認なので、population rate、market share、causal lift、retention impactはblocked claimです。`validation-ready`はrunと一致するExperimentSpecが事前登録された段階であり、実測済みまたは成功を意味しません。run一覧metadataにも`simulationReadinessStatus`を含めるため、本文を開かずに保証境界を確認できます。

runを`get_artifact`で読むと、保存recordに加えて現在のrecipe、persona、全evidenceを再読込してSHA-256とpathを照合した`integrity` reportを返します。`verified`は全照合成功、`failed`はmissing / mismatch / unreadableです。現行schema v5では相談context、canonical seal、構造coverageが必須で、開発中対象はroute-completeなProject Briefと詳細Indie戦略も必須です。依存artifactのdriftはrun本文を失敗させずwarningと個別statusで可視化します。canonical sealは偶発的な編集・driftを検出するchecksumであり、署名や外部attestationではありません。

`get_artifact` は read-only で、list/read semantics は次のとおりです。

| kind | arguments | 結果 |
|---|---|---|
| `intel` / `evaluation` / `run` | `target` なし | target ID 一覧 |
| `intel` / `evaluation` / `run` | `target` あり、`id` なし | artifact metadata 一覧（run本文・round出力は含めない） |
| `intel` / `evaluation` | `target` と `id` あり | JSON / Markdown |
| `run` | `target` と `id` あり | run metadata＋record＋integrity report |
| `capture` / `ui-reference` | `id` なし | 画像 metadata 一覧（captureはPNG/JPEG、ui-referenceはPNG） |
| `capture` / `ui-reference` | `id` あり | metadata と、6 MiB 以下の有効な画像なら `ImageContent` |

target-scoped artifact の `id` 単独指定と、image artifact の `target` 指定は無効です。一覧 metadata は canonical ID、repo-relative path、size、更新時刻を返します。画像は client filesystem access なしで読めます。

## Artifact layout

```text
knowledge/intel/{targetId}/{artifactId}.json
workspaces/{targetId}/{date}-{topicId}.md
workspaces/{targetId}/runs/{runId}.json
knowledge/intel/captures/{captureId}.{png|jpg}
knowledge/ui-references/{referenceId}.png
```

入力された表示名は安全な canonical ID へ正規化され、tool result に repo-relative path が返ります。任意 path、traversal、symlink 経由の root 外アクセスは受け付けません。intel payload は最大 1 MiB、evaluation は最大 512 KiB、run record は最大 2 MiB、inline imageは最大 6 MiB です。

repo内の直接起動では上記layoutの起点はrepository rootです。npm `bin`では `GAME_PLAYER_LENS_HOME`、未設定なら `~/.game-player-lens` が起点です。toolが返すpathは、どちらの実行方式でもそのdata rootからの相対パスです。

## データの解釈

`derive_personas.reviewsPerPolarity` は1 appid・1極性あたり3〜25件を指定でき、既定値は後方互換の25件です。通常の3〜5 persona生成には8件、深掘り監査には25件を目安にしてください。`language`で指定した言語を先に集め、不足分だけall-languageで補い、appidと極性をラウンドロビンに並べます。`sourceRoles` には入力した全appidをちょうど1回ずつ列挙し、各ゲームを `target` / `competitor` / `reference` に明示分類できます。`targetAppid`も渡す場合は唯一の`target`と一致させます。`sourceRoles`を省略して`targetAppid`だけを渡した場合は対象以外を`competitor`、両方を省略した場合は全件を`reference`とする互換動作です。各reviewには確定したsource roleが付き、playtime band・言語・有効な投稿日range・不正日時件数のsample coverageも返ります。`market` / `language`未指定時は後方互換としてJapan / japaneseを使います。

返却される`generationReadiness`は、1 personaにつき最低3件の一意なreview voiceを割り当て、persona間でvoiceを再利用しない前提で生成可能件数を計算します。`blocked`では`generationAllowed=false`となるためpersonaを生成・保存しません。`partial`では要求件数ではなく`supportedCount`件だけを生成し、`ready`でも同じreviewを複数personaのvoiceへ流用しません。`availableUniqueReviewCount`と`requiredUniqueReviewCount`で不足量を確認できます。これはpersonaの妥当性を保証する品質点ではなく、捏造を防ぐ最低限の生成gateです。

新しく生成するpersonaはv2 schemaを使い、`target_context`、購入・継続・離脱・更新反応を持つ`decision_profile`、voiceへ逆参照できるobserved patterns、分離されたinferred traits、limitations、overall confidenceを必須にします。既存のv1 personaは読込・run監査のため引き続き有効です。v2の`update_reaction`に直接根拠がなければ、推論またはunknownとして記録し、市場比率へ変換しません。

この素材は問題発見用の polarity-balanced sample です。`representative: false` であり、市場やレビュー母集団の比率を表しません。この50対50の設計比率から Flow size や adoption likelihood を推定せず、母集団の好評率には `steam_fetch.reviewStats` など別の根拠を使ってください。

SteamSpy の owners、CCU、playtime、review 系の値は推定または取得時点の snapshot です。owners は販売本数ではなく所有推定範囲で、recent release や小標本では特に不確かです。`average_forever=0` は欠損相当の reported zero として扱いますが、CCU 0 は有効な snapshot として保持します。

`steam_timeline.currentCcu` は `observedAt` 時点の現在値であり、24時間ピーク、史上最高、過去CCUではありません。ITAD の `priceHistory` とは時間軸も出典も分けて解釈してください。

`steam_updates`の既定scope=`updates`は公式feedから`patchnotes` tagまたはtitle根拠を持つupdate-like項目を選びます。本文は選定後のtype補助だけに使います。`updateEvidence=steam-tag`と`title-inference`、selected / fetchedのtag件数を分けて確認してください。scope=`official`はevent・sale・community告知も含み、scope=`all`だけが外部記事を含みます。`before`は過去windowの続きを取得するためのexclusive upper boundです。`medianIntervalDays`は返却項目間の記述統計で、適正cadenceや因果効果ではありません。

`steam_fetch.localizedStorefronts` はenglish=US、japanese=JP、german=DEとしてrequested localeを記録します。Steamが未翻訳時にfallback copyを返す可能性があるため、文字列が存在するだけで翻訳済みとは判定しません。`matchesEnglishCopy` は正規化後の英語copyとの完全一致だけを示す `boolean | null` で、fallbackの理由や翻訳品質を証明しません。`referenceLinks` は追加調査の入口であり、リンク先をcaptureまたはartifactとして保存するまではEvidenceに数えません。

## 検証

```bash
pnpm build
pnpm test
pnpm smoke:stdio
pnpm smoke:package
pnpm test:live
pnpm smoke:stdio --live
pnpm exec tsx scripts/smoke-package.ts --live
```

live test の固定 appid はHades `1145360`、Steam画像captureはHades II `1145350`、SteamSpy discovery tagは `Action Roguelike` です。live package smokeは分離した一時data homeでSteam取得→resultHandle保存→原本envelope一致を検証し、終了時に一時dataを削除します。Steam画像captureはObscuraなしでも実行され、生成したJPEGを終了時に削除します。`OBSCURA_PATH` がなければ通常page captureのmanual ui-reference warningを検証し、設定済みならlocalhost captureと `ImageContent` を検証します。`ITAD_API_KEY` がなければtimelineは `priceHistory: null` と設定warning、設定済みなら履歴配列とcurrencyを検証します。

fixture / smokeとは別に、保存した実相談でproduct workflowを検証します。raw artifactはgit管理外へ隔離し、公開可能な集計と監査結果だけを [dogfood data policy](docs/dogfood/README.md) に記録します。3件の実相談、別session replay audit、UI quality-gapが完了し、core v1.1 workflowはdogfood-validatedです。2026-08-12追加のintegrity / coverage / playtest protocolとExperimentSpec → Prediction Run → missing OutcomeのPilot wiring、およびmatching ExperimentSpecから`validation-ready`を導出するserver-side gateはpackage smokeで検証します。実ゲームbuildでのprospective experiment dogfoodとOutcome hash-chainによるserver-verified calibrationは未完了です。

## v1 から v1.1

v1.1では`steam_discover`、`save_artifact`、`get_artifact`を追加し、その後`steam_updates`、read-onlyの`get_status`、初回相談用の`steam_brief`を重ね、現在は14 toolsです。`steam_brief`は個別toolを置き換える完全調査ではなく、どこを深掘りすべきかを決めるbounded triageです。canonical knowledge の `get_knowledge` は固定recipe・rubric用、dynamic artifact の list/read は `get_artifact` を使用します。

現在の判断は [v1.1 設計](docs/superpowers/specs/2026-08-11-steam-user-sim-v1-1-user-workflow-design.md)、実装・検証条件は [v1.1 計画](docs/superpowers/plans/2026-08-11-steam-user-sim-v1-1-user-workflow.md) を参照してください。継続実験のPilotは[Game Discovery Loop設計](docs/superpowers/specs/2026-08-12-game-discovery-loop-design.md)と[実装計画](docs/superpowers/plans/2026-08-12-game-discovery-loop-pilot.md)に分離しています。旧 [v1 設計](docs/superpowers/specs/2026-08-10-steam-user-sim-design.md) と [v1 計画](docs/superpowers/plans/2026-08-10-steam-user-sim.md) は履歴として残しています。npm `bin` packagingは実装済みです。過去CCUとremote deploymentは今後の対象です。
