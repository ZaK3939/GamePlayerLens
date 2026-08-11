# Dogfood #3 — Hades dialogue UI quality-gap

**Date:** 2026-08-11

**Status:** Consultation PASS / UI quality-gap PASS / v1.1 dogfood acceptance complete

**Client-reported model:** Anthropic `claude-fable-5`

## 目的とscope

Hadesの非選択式dialogue overlayを、同じplayer taskを持つ出荷済みpremium-indie作品と比較した。Modeは`baseline`、Selected Domainは`ui`だけである。

Benchmark taskは「PC/controllerでgameplay中に非選択式dialogue overlayが開いた状態から、speakerと現在行を読み、次の操作を識別し、gameplayへ戻るまで進める」と固定した。static imageだけでは実際の行送りと復帰を観測できないため、完了taskの一部は最初から採点不能になりうる条件で評価した。

## Reference supply chain

Game UI Databaseへのcandidate accessはrobots.txtで拒否されたため回避しなかった。代替catalogとして、明示的なDownload linkを持つInterface In Gameを使用した。

- Target: Hades。現在のSteam Store listingに含まれるofficial screenshotを`ui_capture`の`steam-image`経路で保存。
- Reference B: [Hollow Knight dialogue](https://interfaceingame.com/screenshots/hollow-knight-dialogue/)
- Reference C: [Blasphemous dialogue](https://interfaceingame.com/screenshots/blasphemous-dialogue/)

reference画像はprivate dogfood storageだけに保持した。B/Cはsourceの3840×2160画像をcropせず1920×1080へ正規化した。exact screenshot platform/controlはsource pageから確認できず`unknown`、targetも画像単独ではbuild versionを確認できない。これらはcohort mismatchとしてrunに残した。

## Pre-reveal discipline

最初のtarget候補は画面内にpre-release version表示があり、shipped-cohort gateを満たさないためscore artifactごと無効化した。現在のSteam Store listingからversion表示のない画像を再取得し、新しいopaque aliasで全scoreを固定し直した。無効artifactのscoreは最終評価に使っていない。

definitive pre-revealはD / B / Cのaliasだけで採点し、identity mapping開示前にscore、観測位置、順位、改善原則を保存した。ただしart styleの認識リスクが高く、model memoryの隔離を証明できないため、結果をblind comparisonとは呼ばず`non-blind structured comparison`とした。

## 非公開artifact

- Evaluation: `workspaces/hades/2026-08-11-dialogue-ui-quality-gap.md`
- Run ID: `b0012904-ef83-4867-9e5e-4e03407c3232`
- Run: `workspaces/hades/runs/b0012904-ef83-4867-9e5e-4e03407c3232.json`
- Locked scores: `knowledge/intel/hades/ui-dialogue-pre-reveal-scores-final.json`
- Provenance: `knowledge/intel/hades/ui-dialogue-provenance-{d,b,c}.json`

画像、review本文、round全文はgit管理外の`.game-player-lens-dogfood/`に保持する。

## 実行結果

| 検証項目 | 結果 |
|---|---:|
| target images | 1 |
| reference cohort | 2 |
| provenance artifacts | 3 |
| run内evidence refs | 9 |
| simulation rounds | 6 |
| warnings | 11 |
| broken references | 0 |
| confidence / calibration | medium / not-calibrated |
| evaluation / run / image readback | PASS |

6 roundsはpersona 3件、UI-domain 1件、harsh critic 1件、synthesis 1件で、sequence 1〜6が連続している。9 evidenceはlocked score、provenance 3件、image 3件、targetの保存済みSteam fetch、最終evaluationである。

## Gap result

TargetはHades、reference medianはHollow KnightとBlasphemousのscored値から算出した。`unscored`は0として計算していない。

| Axis | Target | Reference median | Gap |
|---|---:|---:|---:|
| Task clarity | 3 | 2 | +1 |
| Information hierarchy | 4 | 2 | +2 |
| Density / typography | 3 | 2.5 | +0.5 |
| Input / affordance | unscored | 2 | N/A |
| State / feedback | 3 | 2.5 | +0.5 |
| Accessibility | 4 | 2.5 | +1.5 |
| Consistency / finish | 4 | 3 | +1 |
| Flow / motion | unscored | unscored | N/A |

scored軸にmaterial deficitはなかった。speaker name、role、portrait、lineを短い視線移動へ統合した階層、高contrastでcolor-independentな帰属、visual-systemのfinishが保全すべきstrengthとなった。

一方、全画像でcontrollerの明示的なadvance affordanceを確認できず、static-onlyのためflow/motionも採点できない。これはtarget勝利ではなくcohort全体のevidence gapである。text areaの充填率も日本語や長文で未検証のため、正のgapからlocalization safetyを断定していない。

## Recommendation

勧告はUI変更ではなく「小規模検証」である。同一task・PC・controllerの動画または連続captureを使い、advance promptの有無とtiming、dialogue終了からgameplay復帰までのtransition、日本語textのfillとwrapを確認する。成功条件はaxis 4と8がscoredになり、日本語表示のoverrunがないこと。

## 今回観測したfriction

- manual provenanceの`observedAt`をmodelが申告した結果、serverの`savedAt`より約31分先になった。時刻の信頼境界を改善するため、manual保存ではserver clockを既定値にする候補を最優先で検討する。
- `get_knowledge(kind=personas)`がrepository-relative pathを返さず、run seal後までpathを確定確認できなかった。
- 単一imageの`get_artifact`はmetadata-only読込がなく、検証readbackでも画像本文を再送する。list endpointで回避できるがtoken効率が悪い。
- invalidated captureとui-referenceをMCPから安全にcleanupする経路がない。最終runからは除外したがprivate listingには残る。

これらはUI gapの結論を壊さなかったが、次の実装優先度を推測ではなく3件のdogfood観測から決める材料とする。
