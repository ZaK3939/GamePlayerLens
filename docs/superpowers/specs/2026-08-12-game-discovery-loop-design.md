# Game Discovery Loop Pilot Design

**Status:** Pilot implemented and package-verified; prospective game dogfood pending
**Reference:** [Discovery Loop](https://www.discoveryloop.com/) — propose, run, examine, iterateという測定可能な実験loopのビジョンだけを参照し、非公開の製品仕様は仮定しない。

## Goal

GamePlayerLensの単発simulationを、事前登録した仮説、封印した予測、実測結果、次の仮説へ追跡できる継続的なgame discovery loopへ拡張する。

serverは実験を自動実行しない。MCP clientまたはユーザーが実験を実行し、serverは計画、予測、根拠、結果の保存とintegrity確認を担う。

## Existing foundations

- `save_artifact(kind=intel)`はmanual JSONをatomicに保存できる。
- `save_artifact(kind=run)`はscenario、persona、evidence、round、recipeをSHA-256付きでimmutableに封印する。
- `playtest.md`はAI操作と人間代表性の境界、build、task、Action → responseを定義済み。
- `update-strategy.md`はsuccess signal、guardrail、停止条件を持つ。
- `evidence-coverage.md`はobserved / reported-zero / estimated / missingを区別する。

## Pilot boundary

Pilotではtool、run schema、path layoutを変更しない。ExperimentSpecとExperimentOutcomeを`sourceTool=manual`のintel payloadとして保存し、`experiment.md` rubricでshapeと順序を規定する。

specとoutcomeでは`overwrite=true`を禁止する。ただしPilotのintel store自体は明示されたoverwriteを技術的に拒否しないため、run sealによるspec drift検出と運用規約が保証境界になる。2〜3件のprospective experimentでshapeが安定した後、専用immutable artifact kindで機械検証する。

## Artifact chain and derived state

状態をmutable fieldとして書き換えず、artifact chainから導出する。

```text
ExperimentSpec --evidence--> Prediction Run --ref--> ExperimentOutcome
       ^                                            |
       |------------ next ExperimentSpec -----------|
```

- `registered`: ExperimentSpec intelが存在する。
- `predicted`: runがspecをevidenceとして封印し、planned scenariosを評価する。
- `observed`: outcomeがspec hashとprediction run hashを参照する。結果がmissingでもoutcome自体は作る。
- `learned`: 次のspecがparent outcomeを参照し、次のprediction runがそのspecとparent outcomeの両方をevidenceとして封印する。

既存runは実験実行ではなく予測simulationであるため、`executed`とは呼ばない。

## ExperimentSpec v1

Top-level required fields:

- `schemaVersion: 1`
- `artifactType: "experiment-spec"`
- `experimentId`, `targetId`
- `hypothesis`: falsifiableな行動仮説
- `mode: baseline | change`
- `plannedScenarios`: run `scenarios`と同じid / label / specification
- `primaryMetricId`: metrics内にちょうど1件存在するprimary metric
- `metrics`
- `successCriteria`
- `guardrails`
- `predictions`
- `stoppingRule`
- `orderBiasPlan`
- optional `parentOutcomeRef`

各metricは`metricId`、`role`、`source`、`instrument`、`unit`、`aggregation`、`direction`、`cohort`、`window`、`samplePlan`を持つ。roleは`primary / secondary / guardrail / exploratory`、sourceは`ai-playtest / human-playtest / telemetry / steam-reviews / store-metric / manual-observation`のいずれかとする。

success criterionとguardrailは`criterionId`、`metricId`、`scenarioId`、任意の`referenceScenarioId`、`comparator`、`value`を持つ。metricとscenarioの参照先はspec内に存在しなければならない。referenceScenarioIdがある場合は同一source / instrument / unit / cohort / windowのcandidate minus referenceを比較する。

## ExperimentOutcome v1

Top-level required fields:

- `schemaVersion: 1`
- `artifactType: "experiment-outcome"`
- `experimentId`, `targetId`
- `specRef`: target、id、prediction run evidenceに保存されたSHA-256
- `predictionRunRef`: target、run ID、run artifact SHA-256、canonical record SHA-256
- `measurementEvidence`: ref、target、id、source
- `results`
- `criterionVerdicts`
- `guardrailVerdicts`
- `overallVerdict: success | failure | mixed | unresolved | stopped`
- `deviations`
- `learnings`

各resultはmetricId、scenarioId、status、source、instrument、unit、cohort、window、sampleSize、evidenceRefsを持ち、metricId × scenarioIdで一意とする。statusがobserved / reported-zero / estimatedなら有限なvalueが必須で、missingならvalueを持たない。比較criterionはcandidateとreference双方のresultから差分を計算する。片方がmissing、minimum sample未達、またはspecとsource、instrument、unit、cohort、windowが一致しない値はexploratory evidenceには使えるが、事前登録criterionの充足には使わずunresolvedとする。`observed` stageはOutcome artifactの記録を表し、個別metricの測定状態はresult statusだけで判断する。

## Measurement boundary

- AI playtestは再現可能な操作摩擦を直接観測できるが、人間のfun、需要、completion rate、retentionをobservedにしない。
- human playtestは指定participant / task / protocol範囲だけを表す。
- telemetryはevent definition、build、cohort、window、aggregationが一致する場合だけ比較する。
- Steam reviewsとstore metricsは別sourceであり、同一指標へ平均しない。
- source間の単一score化を禁止し、比較は同一source / instrument / unit / cohort / window内で行う。

## Calibration boundary

prediction runは将来のoutcomeを参照できないため、最初のrunは`not-calibrated`である。

- `not-calibrated`: 過去の対応outcomeを根拠に使っていない。
- `partially-calibrated`: 過去outcomeはあるがprimary resultがestimated / missing、criteriaの一部だけobserved、またはprotocol条件が一部異なる。
- `calibrated`: 同一targetかつ同一metric / source / instrument / unit / cohort / protocolのprimary predictionと実測を対応付けた過去outcomeをevidenceに含み、その限定範囲をconfidence basisに明記する。

`calibrated`はモデル全般の統計的校正を意味しない。既存の`reportedByClient=true`を維持する。

## Pilot acceptance

- canonical `experiment.md`がspec、outcome、state、measurement、calibration境界を定義する。
- `run-sim.md`がspec保存→prediction run→outcome→次specの順序を要求する。
- package smokeがsynthetic specを保存し、runがspecをSHA-256付きevidenceとして封印し、missing outcomeを保存・readbackする。
- exactly 12 tools / 2 promptsと既存run schemaを維持する。
- synthetic smokeを実ゲームplaytestやoutcome calibrationと表現しない。

## Deferred enforcement

Pilot後に`experiment` / `outcome`を`save_artifact`と`get_artifact`のkindへ追加し、専用Zod schema、常時immutable save、時刻順、hash一致、lineage循環、calibration構造をserver側で検証する。専用tool、scheduler、server-side LLM、統計検定、telemetry ingestion、parallel orchestrationは対象外とする。
