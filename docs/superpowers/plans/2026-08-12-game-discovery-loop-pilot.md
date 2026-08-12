# Game Discovery Loop Pilot Implementation Plan

**Status:** Implemented and verified
**Design:** [Game Discovery Loop Pilot Design](../specs/2026-08-12-game-discovery-loop-design.md)

## Goal

既存12-tool surfaceとrun schemaを変えず、ExperimentSpec → Prediction Run → ExperimentOutcome → next ExperimentSpecのprospective loopをcanonical rubricとpackage smokeで利用可能にする。

## Task 1: Canonical experiment contract

### Files

- Create: `knowledge/rubrics/experiment.md`
- Modify: `src/knowledge-content.test.ts`

### Tests first

- spec / outcomeのrequired fieldとartifactTypeを要求する。
- registered / predicted / observed / learnedをmutable statusなしで導出する。
- primary metricが1件、閾値とguardrailが事前登録される。
- AI / human / telemetryを分離し、source mismatchをcriterion充足へ使わない。
- missingを0やfailureへ変換しない。
- calibrationの3段階と限定範囲を要求する。

## Task 2: Recipe and public documentation

### Files

- Modify: `skills/run-sim.md`
- Modify: `README.md`
- Modify: `docs/dogfood/README.md`

### Behavior

- prospective experimentだけを事前登録と呼ぶ。
- specとoutcomeはPilot中だけmanual intelとして保存し、overwriteを禁止する。
- prediction runはspecをevidenceとして使用する。
- outcomeはrun readbackからspec SHA、run artifact SHA、canonical record SHAを参照する。
- outcomeがmissingでもunresolvedとして保存する。
- 次runはparent outcomeをevidenceとして封印する。

## Task 3: Packaged loop smoke

### Files

- Modify: `scripts/smoke-package.ts`

### Tests

- packaged `experiment.md`を取得する。
- synthetic ExperimentSpecを保存する。
- spec / outcomeの同じIDへの再保存がdefault overwrite falseで失敗する。
- run evidenceにspecが入りintegrity verifiedとなる。
- run readbackのspec SHAとrun metadata/sealを使ってmissing outcomeを保存する。
- outcome readbackが全参照hash、unresolved、missingを保持する。
- tool 12 / prompt 2 invariantを維持する。

## Task 4: Verification and prospective dogfood boundary

- `pnpm test`
- `pnpm build`
- `pnpm smoke:stdio`
- `pnpm smoke:package`
- `pnpm test:live`
- `pnpm smoke:stdio --live`
- `pnpm exec tsx scripts/smoke-package.ts --live`
- 操作可能な開発buildがない限り、実outcome calibration完了とは記録しない。
- 次の開発中ゲーム相談で、結果を見る前にspecを保存して最初の実dogfoodを開始する。

## Verification result

- `pnpm test`: 20 files / 330 tests PASS。
- `pnpm build`: PASS。
- `pnpm smoke:stdio`: 12 tools / 2 prompts、protocol error 0。
- `pnpm smoke:package`: spec / outcome重複拒否、verified run、hash-linked missing outcomeを含めPASS。
- `pnpm test:live`: 7 files / 9 tests PASS、Obscura依存の1件は未設定のためSKIP。
- `pnpm smoke:stdio --live`: live search / discovery / updates / resultHandle PASS。
- `pnpm exec tsx scripts/smoke-package.ts --live`: experiment loopとlive exact saveを含めPASS。
- `experiment.md`のJSON例2件を`JSON.parse`で検証済み。
- Hades update strategy runを現在のrecipe hashで再封印し、17 dependencies、issue 0、coverage 100%を確認した。
- 実ゲームのprospective experimentは0件。Pilot wiringの成功をgame outcomeやcalibration完了には数えない。
