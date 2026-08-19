# Steam Release Readiness rubric

目的は、Steam掲載を単一の「公開準備完了」scoreにせず、次の7つの順序付きgateとして管理することです: Onboarding / app credit、App configuration、Store Presence、Game Build、Coming Soon、Pricing / launch offer、Manual release。これはplayer fun、需要、売上を判定するrubricではありません。

## Applicability

`store-reveal`、`release-date`、`launch`を決める時に適用します。通常の価格照会、競合調査、prototype reviewではN/A理由を残します。Steamworksの仕様は変更され得るため、実行時に下記の公式資料を再確認し、URLと`accessedAt`を保存します。数値は固定知識として将来へ流用しません。

## Evidence and privacy boundary

- Steamworks画面を直接確認できない場合、developerのchecklist statusは`reported`であり`observed`ではありません。Developerが入力したSteamworks状態は常に`reported`です。
- captureする場合もapp ID、gate名、状態、日付だけを残します。credential、session cookie、password、recovery code、bank / tax / identity documentは要求せず、保存しません。
- official documentationの現在要件とproject statusを別Evidence IDにします。記憶、blog、動画、他developerの事例を現行platform ruleにしません。
- 日数を足す時はfee-paid、review submission / approval、Coming Soon liveの各日付とtimezoneを保存し、不明ならEarliest release dateを`unresolved`にします。
- 最初のいくつかのtitleに対するfee支払からの30-day waiting periodはgate 1のdate mathです。Coming Soonのat least two weeksはgate 5のdate mathです。どちらも独立gateにしません。

## Ordered release path

| Order | Gate | Required evidence | Blocking condition |
|---:|---|---|---|
| 1 | Onboarding / app credit | partner onboarding、Steam Direct Fee / app credit activation、fee-paid date | onboarding未完了、app credit未activation、date missing、applicable 30-day wait未経過 |
| 2 | App configuration | app / package / depot / launch option / supported OS / pricing setup | purchaseまたは起動に必要な構成がmissing |
| 3 | Store Presence | checklist complete、proposed pricing、`Mark as ready for review`、Valve result | review未提出、changes requested、未承認 |
| 4 | Game Build | mostly-final default-branch build、Steam client installation / launch test、checklist、review result | Store Presence未提出、build review未承認、store promiseのfeatureがbuildにない |
| 5 | Coming Soon | approved pageのlive dateと公式minimum。soundtrack exceptionの有無 | page未承認、`Post as Coming Soon`未実行、live date missing、minimum未経過 |
| 6 | Pricing / launch offer | approved base prices、全required currencies、launch discount feasibility | missing currency、minimum違反、率 / 期間 / cooldown違反 |
| 7 | Manual release | `Publish App Changes To Steam`と`Manage Pricing & Discounts`、support / rollback owner、`Release App` | permission missing、blocking defect、rollback不能、`Release App`未実行 |

Store PresenceとGame Buildには別checklistとreviewがあります。Store Presenceを先に提出し、両方の承認をreleaseに必要とします。SteamPipe uploadの成功だけをGame Build reviewまたはplayer-facing installation testの成功にしません。App configurationをStore Presenceへ混ぜません。

Steam Direct Feeは現在USD 100（またはequivalent）。Steam Wallet不可、Adminが購入し、支払った本人だけがactivationできます。$1,000 AGR後にrecoup可能です。最初のいくつかのtitleにはfee支払からreleaseまでの`30-day waiting period`があります。

Store Presence reviewは通常3〜5営業日、pageをliveにしたい日の少なくとも7営業日前提出が案内です。Release Processは「7 days」、Steam Direct overviewは1-5 daysと書きます。いずれもguidanceでありSLAではありません。

承認済みtitleは自動公開されません。権限を持つ担当者が`Release App` → `Publish Now` → `Release Now`を実行するmanual releaseです。公開時刻、support coverage、rollback / hotfix経路をrelease ownerと確認します。Coming Soonとreleaseに必要な権限は`Publish App Changes To Steam`と`Manage Pricing & Discounts`です。

### Coming Soon timing

- 新製品はpublic Coming Soonをrelease前に`at least two weeks`必要です。Early Accessでも必要です。
- `Post as Coming Soon`は承認後のmanual操作です。
- Coming Soonがliveでrelease dateが14日以内になると、Valve連絡なしでは日付変更できません。
- 既にreleasedなbase gameに紐づくsoundtrackはComing Soon minimumの免除対象になり得ます。standalone soundtrackは免除しません。

## Pricing feasibility

Pricing Decision Traceのbase priceとlaunch discountを、このrubricでは販売効果ではなくplatform feasibilityとして検査します。

- launch discountは任意、pre-releaseのみ設定可、10–40%、7–14日、該当日の10am Pacific終了。開始後に30-day discount cooldownが始まります。
- post-launchの標準discountは10–95%、1–14日。
- cooldown: 30-day release（Early Accessと1.0の両方）、30-day price-increase（例外なし）、30-day discount-to-discount（Seasonal Salesだけこのcooldownを免除）。
- release後30日以内の値上げはできません。EA→1.0の30日以内値上げはlaunch discountを無効にします。
- 37 currencies + 4 USD region groups。欠けたcurrencyはその国で購入不可。
- 最低baseは約$0.99 multi-variable相当。最低transactionはその約50%。
- discount終了後に維持されるbona fide base priceを確認します。

心理的効果やconversionは`price` domainの仮説です。rule-validであることは売れる証拠ではなく、売れそうでもrule-invalidな案は実行候補にしません。

## Required output: Steam Release Readiness

Selected（`store-reveal` / `release-date` / `launch`）では次のmetadataのあと、下表を7行すべて出します。N/Aでは見出しと1行の`適用外:` / `Status: N/A`理由だけを残し、tableは不要です。

- Status: Selected / N/A
- Earliest release date: verified YYYY-MM-DD / unresolved（gateから導出。marketing targetにしない）
- Blocking gate: 表のGate名そのもの / none
- Official rules checked at: Steamworks URL + accessedAt

Current status: `not-started` / `blocked` / `submitted` / `changes-requested` / `approved` / `live` / `N/A`。Evidence status / ID: `observed` / `reported` / `missing` + `E-###`または`missing`。Owner: role / `unassigned`。Next action: 一つ。

| Gate | Current status | Evidence status / ID | Official source | Date / earliest completion | Owner | Next action |
|---|---|---|---|---|---|---|
| Onboarding / app credit | ［token］ | ［observed / reported / missing、E-###またはmissing］ | ［Steamworks URL］ | ［YYYY-MM-DD / unresolved］ | ［role / unassigned］ | ［一つ］ |
| App configuration | ［token］ | ［同上］ | ［同上］ | ［同上］ | ［同上］ | ［一つ］ |
| Store Presence | ［token］ | ［同上］ | ［同上］ | ［同上］ | ［同上］ | ［一つ］ |
| Game Build | ［token］ | ［同上］ | ［同上］ | ［同上］ | ［同上］ | ［一つ］ |
| Coming Soon | ［token］ | ［同上］ | ［同上］ | ［同上］ | ［同上］ | ［一つ］ |
| Pricing / launch offer | ［token］ | ［同上］ | ［同上］ | ［同上］ | ［同上］ | ［一つ］ |
| Manual release | ［token］ | ［同上］ | ［同上］ | ［同上］ | ［同上］ | ［一つ］ |

Blocking gateは上記7名または`none`です。app fee wait、permissions、release controlなどの別enumを作りません。release dateを出す場合は全gateから導いたearliest dateとprojectのtarget dateを分けます。外部review時間を確約せず、blocked gateを後段の準備で相殺しません。

## Official sources

- [Steamworks Partner Program / onboarding](https://partner.steamgames.com/steamdirect/)
- [Getting Started](https://partner.steamgames.com/doc/gettingstarted)
- [Steam Direct Fee](https://partner.steamgames.com/doc/gettingstarted/appfee)
- [Release Process](https://partner.steamgames.com/doc/store/releasing)
- [Review Process](https://partner.steamgames.com/doc/store/review_process)
- [Coming Soon](https://partner.steamgames.com/doc/store/coming_soon)
- [Release Options](https://partner.steamgames.com/doc/store/types)
- [Uploading to Steam / SteamPipe](https://partner.steamgames.com/doc/sdk/uploading)
- [Game Soundtracks](https://partner.steamgames.com/doc/store/application/soundtrackapp)
- [Managing Users & Permissions](https://partner.steamgames.com/doc/gettingstarted/managing_users)
- [Pricing](https://partner.steamgames.com/doc/store/pricing)
- [Discounting](https://partner.steamgames.com/doc/marketing/discounts)
