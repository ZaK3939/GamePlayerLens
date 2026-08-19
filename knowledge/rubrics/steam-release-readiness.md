# Steam Release Readiness rubric

目的は、Steam掲載を単一の「公開準備完了」scoreにせず、onboarding、store、build、pricing、Coming Soon、manual releaseを順序付きgateとして管理することです。これはplayer fun、需要、売上を判定するrubricではありません。

## Applicability

`store-reveal`、`release-date`、`launch`を決める時に適用します。通常の価格照会、競合調査、prototype reviewではN/A理由を残します。Steamworksの仕様は変更され得るため、実行時に下記の公式資料を再確認し、URLと`accessedAt`を保存します。

## Evidence and privacy boundary

- Steamworks画面を直接確認できない場合、developerのchecklist statusは`reported`であり`observed`ではありません。
- captureする場合もapp ID、gate名、状態、日付だけを残します。credential、session cookie、password、recovery code、bank / tax / identity documentは要求せず、保存しません。
- official documentationの現在要件とproject statusを別Evidence IDにします。記憶、blog、動画、他developerの事例を現行platform ruleにしません。
- 日数を足す時はfee-paid、review submission / approval、Coming Soon liveの各日付とtimezoneを保存し、不明ならEarliest release dateを`unresolved`にします。

## Ordered release path

| Order | Gate | Required evidence | Blocking condition |
|---:|---|---|---|
| 1 | Onboarding / app credit | partner onboarding status、Steam Direct Fee / app credit activation、fee-paid date | onboarding未完了、app credit未activation、date missing |
| 2 | App configuration | app / package / depot / launch option / supported OS / pricing status | purchaseまたは起動に必要な構成がmissing |
| 3 | Store Presence | checklist complete、proposed pricing、`Mark as ready for review`、Valve result | Store Presence review未提出、changes requested、未承認 |
| 4 | Game Build | mostly-final default-branch build、Steam client installation / launch test、checklist、review result | Store Presence未提出、build review未承認、store promiseにあるfeatureがbuildにない |
| 5 | Coming Soon | approved pageのlive dateと公式minimum | page未承認、live date missing、minimum未経過 |
| 6 | Pricing / launch offer | approved base prices、全required currencies、launch discount feasibility | missing currency、minimum threshold違反、率 / 期間 / cooldown違反 |
| 7 | Manual release | required permissions、support / rollback owner、release controls | permission missing、blocking defect、rollback不能、`Release App`未実行 |

Store PresenceとGame Buildには別checklistとreviewがあります。Store Presenceを先に提出し、両方の承認をrelease gateにします。SteamPipe uploadの成功だけをGame Build reviewまたはplayer-facing installation testの成功にしません。

現在の公式説明では、最初のいくつかのtitleにSteam Direct Fee支払からreleaseまでの`30-day waiting period`があり、public `Coming Soon`はrelease前に`at least two weeks`必要です。store reviewは通常3〜5営業日と案内されていますが、変更対応を含む保証期限ではありません。値は固定知識として将来へ流用せず、毎回公式sourceで再確認します。

承認済みtitleは自動公開されません。権限を持つ担当者がSteamworksの`Release App`から確認操作を行うmanual releaseです。公開時刻、support coverage、rollback / hotfix経路をrelease ownerと確認します。

## Pricing feasibility

Pricing Decision Traceのbase priceとlaunch discountを、このrubricでは販売効果ではなくplatform feasibilityとして検査します。

- launch discountの現在の許容率と期間
- base priceと各currencyのminimum threshold
- release、price increase、discount後のcooldown
- discount終了後に維持されるbona fide base price
- pricing / discountとreleaseに必要なpermissions

心理的効果やconversionは`price` domainの仮説です。rule-validであることは売れる証拠ではなく、売れそうでもrule-invalidな案は実行候補にしません。

## Required output: Steam Release Readiness

- Status: Selected / N/A
- Earliest release date: verified date / unresolved
- Blocking gate: ordered gate名 / none
- Official rules checked at: URL + accessedAt

| Gate | Current status | Evidence status / ID | Date / earliest completion | Owner | Next action |
|---|---|---|---|---|---|
| ［ordered gate］ | ［not-started / blocked / submitted / changes-requested / approved / live / N/A］ | ［observed / reported / missing、E-###］ | ［date / unresolved］ | ［role / unassigned］ | ［一つ］ |

release dateを出す場合は全gateから導いたearliest dateとprojectのtarget dateを分けます。外部review時間を確約せず、blocked gateを後段の準備で相殺しません。

## Official sources

- [Steamworks Partner Program / onboarding](https://partner.steamgames.com/steamdirect/)
- [Getting Started](https://partner.steamgames.com/doc/gettingstarted)
- [Steam Direct Fee](https://partner.steamgames.com/doc/gettingstarted/appfee)
- [Release Process](https://partner.steamgames.com/doc/store/releasing)
- [Review Process](https://partner.steamgames.com/doc/store/review_process)
- [Release Options / Coming Soon](https://partner.steamgames.com/doc/store/types)
- [Uploading to Steam / SteamPipe](https://partner.steamgames.com/doc/sdk/uploading)
- [Pricing](https://partner.steamgames.com/doc/store/pricing)
- [Discounting](https://partner.steamgames.com/doc/marketing/discounts)
