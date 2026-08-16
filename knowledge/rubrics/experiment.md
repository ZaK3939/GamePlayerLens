# Prospective experiment loop rubric

目的は、GamePlayerLensの提案を、結果を見る前に固定した仮説と測定計画、封印した予測、実測結果、次の仮説へつなぐことです。これは実験schedulerや因果推論engineではありません。MCP clientまたはユーザーが実験を実行し、serverはartifactを保存・検証します。

## 1. Loop stages

stageはmutable status fieldを持たない設計とし、次のartifact chainから導出します。

- `registered`: ExperimentSpec intelが存在する。
- `predicted`: Prediction RunがExperimentSpecをevidenceとして使用し、specと同じplanned scenariosを封印する。
- `observed`: ExperimentOutcomeがspec SHA-256とPrediction Runのhashを参照する。測定不能で全resultがmissingでもoutcomeは作る。
- `learned`: 次のExperimentSpecが`parentOutcomeRef`を持ち、次のPrediction Runが新spec、parent outcome、hash-linked measurementを全analysis phaseで使って封印する。

既存のrunは予測simulationの封印であり、ゲームbuildやexperimentが実行済みであることを意味しません。そのため`executed`とは呼ばないで、`predicted`とします。

ここで`observed`はOutcome artifactが記録されたstage名であり、個々のmetricが観測済みという意味ではありません。metricの測定状態はresultの`status`だけで判断します。

ExperimentSpec、ExperimentMeasurement、ExperimentOutcomeは`save_intel(sourceTool=manual)`で保存します。artifact storeはcreate-onlyで同じcanonical IDの再利用を拒否します。run integrityとOutcome validatorが照合するexact SHA-256も保証境界に含めます。

## 2. ExperimentSpec

結果を見る前、proposal buildを測定する前に、`artifactType: "experiment-spec"`のpayloadを保存します。すでに結果を見た分析はretrospectiveと明記し、事前登録として保存しません。

```jsonc
{
  "schemaVersion": 1,
  "artifactType": "experiment-spec",
  "experimentId": "inventory-rail-001",
  "targetId": "project-nyx",
  "hypothesis": "icon railでinventory taskの誤入力が減る",
  "mode": "change",
  "plannedScenarios": [
    {"id": "current", "label": "Current", "specification": "現在build"},
    {"id": "proposal", "label": "Proposal", "specification": "icon rail build"}
  ],
  "primaryMetricId": "misinput-count",
  "metrics": [{
    "metricId": "misinput-count",
    "role": "primary",
    "source": "human-playtest",
    "instrument": "moderated task observation v1",
    "unit": "count/session",
    "aggregation": "median",
    "direction": "decrease",
    "cohort": "new keyboard-and-mouse players",
    "window": "first inventory task",
    "samplePlan": {"unit": "participant", "targetCount": 8, "minimumCount": 6}
  }, {
    "metricId": "task-completion-rate",
    "role": "guardrail",
    "source": "human-playtest",
    "instrument": "moderated task observation v1",
    "unit": "proportion",
    "aggregation": "rate",
    "direction": "increase",
    "cohort": "new keyboard-and-mouse players",
    "window": "first inventory task",
    "samplePlan": {"unit": "participant", "targetCount": 8, "minimumCount": 6}
  }],
  "successCriteria": [{
    "criterionId": "primary-improvement",
    "metricId": "misinput-count",
    "scenarioId": "proposal",
    "referenceScenarioId": "current",
    "comparator": "<=",
    "value": -2
  }],
  "guardrails": [{
    "criterionId": "completion-guardrail",
    "metricId": "task-completion-rate",
    "scenarioId": "proposal",
    "referenceScenarioId": "current",
    "comparator": ">=",
    "value": -0.05
  }],
  "predictions": [{
    "metricId": "misinput-count",
    "scenarioId": "proposal",
    "referenceScenarioId": "current",
    "predictedDelta": -2,
    "confidence": "medium",
    "basis": "persona evidence and prior playtest"
  }],
  "stoppingRule": {
    "outcomeDeadline": "2026-09-12",
    "maximumSessions": 16,
    "onGuardrailBreach": "stop-and-review",
    "onRepeatedSourceBias": "stop-and-change-source"
  },
  "orderBiasPlan": "current/proposalを別sessionで実施し、順序をcounterbalanceする",
  "parentOutcomeRef": null
}
```

必須fieldは`schemaVersion`、`artifactType`、`experimentId`、`targetId`、`hypothesis`、`mode`、`plannedScenarios`、`primaryMetricId`、`metrics`、`successCriteria`、`guardrails`、`predictions`、`stoppingRule`、`orderBiasPlan`です。`parentOutcomeRef`は最初のloopではnull、反復時は`target`とoutcome intel `id`を持ちます。

### Metric rules

- roleは`primary / secondary / guardrail / exploratory`から選ぶ。`role=primary`のprimary metricはちょうど1件で、`primaryMetricId`と一致させる。
- metricごとにsource、instrument、unit、aggregation、direction、cohort、window、samplePlanを事前登録する。
- sourceは`ai-playtest / human-playtest / telemetry / steam-reviews / store-metric / manual-observation`から選ぶ。
- comparatorは`< / <= / = / >= / >`のいずれか。`referenceScenarioId`があるcriterionのvalueはcandidate minus referenceの閾値とする。
- success criterionとguardrailの`metricId`はmetrics内、`scenarioId`と`referenceScenarioId`はplannedScenarios内に存在しなければならない。
- successはprimary metricの`successCriteria`で決める。secondary / exploratory metricだけでsuccessへ変更しない。
- guardrailは悪化停止条件であり、primary successより優先する。
- `plannedScenarios`はPrediction Runのscenario ID、label、specificationと一致させる。

Prediction Run保存時、serverは上記shapeと参照整合性に加え、specの`targetId`、`mode`、`plannedScenarios`がrunと完全一致するかを判定します。一致するspecをrun evidenceとして実際に使用した場合だけ`simulationReadiness.status=validation-ready`になります。specがない、schema不正、またはrunと不一致の場合も監査記録としてrunは保存できますが、statusは`rehearsal`のままです。

## 3. Prediction Run

通常の`game-review.md`に従ってreview runを作りますが、outcome measurementより前の根拠だけを使います。

- ExperimentSpecをrunのintel evidenceに含め、少なくともpersona、domain、critic、synthesisの判断で引用する。
- 次loopではparent ExperimentOutcomeもevidenceに含め、どのlearningを採用したかroundへ記録する。
- run保存後に`get_artifact(kind=run)`で`integrity.status=verified`を確認する。
- `simulationReadiness.status=validation-ready`と`heldOutValidation.status=planned`を確認する。`rehearsal`なら事前登録済みPrediction Runとして扱わず、spec mismatchを修正して新しいrunを封印する。
- run recordに保存されたspec evidence SHA-256、run metadataのrun artifact SHA-256、sealのcanonical record SHA-256をOutcomeへ引き継ぐ。
- proposal buildの実測結果をPrediction Runへ混ぜない。すでに結果を知っている場合はpredictionではなくretrospective analysisとする。

## 4. ExperimentOutcome

Prediction Runをverifiedにした後で、事前登録したsourceとprotocolを使って測定します。raw session、telemetry export、集計根拠はstrictなExperimentMeasurement envelopeを持つ別intelとして先に保存し、Outcomeはそのexact SHA-256参照と判定を持ちます。

Measurement payloadは`artifactType: "experiment-measurement"`として識別します。

```jsonc
{
  "schemaVersion": 1,
  "artifactType": "experiment-measurement",
  "measurementId": "inventory-rail-001-misinput",
  "experimentId": "inventory-rail-001",
  "targetId": "project-nyx",
  "metricId": "misinput-count",
  "source": "human-playtest",
  "instrument": "moderated task observation v1",
  "unit": "count/session",
  "aggregation": "median",
  "cohort": "new keyboard-and-mouse players",
  "window": "first inventory task",
  "scenarioResults": [
    {"scenarioId": "current", "value": 4, "sampleSize": 8},
    {"scenarioId": "proposal", "value": 1, "sampleSize": 8}
  ],
  "protocolDeviations": []
}
```

Outcome payloadは`artifactType: "experiment-outcome"`として識別します。

```jsonc
{
  "schemaVersion": 1,
  "artifactType": "experiment-outcome",
  "experimentId": "inventory-rail-001",
  "targetId": "project-nyx",
  "specRef": {
    "target": "project-nyx",
    "id": "experiment-inventory-rail-001-spec",
    "sha256": "prediction-run evidence SHA-256"
  },
  "predictionRunRef": {
    "target": "project-nyx",
    "runId": "uuid",
    "runArtifactSha256": "run artifact SHA-256",
    "canonicalRecordSha256": "canonical record SHA-256"
  },
  "measurementEvidence": [{
    "ref": "human-sessions",
    "target": "project-nyx",
    "id": "inventory-rail-human-sessions",
    "sha256": "measurement intel SHA-256",
    "metricId": "misinput-count",
    "source": "human-playtest"
  }],
  "results": [
    {
      "metricId": "misinput-count",
      "scenarioId": "current",
      "status": "observed",
      "source": "human-playtest",
      "instrument": "moderated task observation v1",
      "unit": "count/session",
      "aggregation": "median",
      "cohort": "new keyboard-and-mouse players",
      "window": "first inventory task",
      "value": 4,
      "sampleSize": 8,
      "evidenceRefs": ["human-sessions"]
    },
    {
      "metricId": "misinput-count",
      "scenarioId": "proposal",
      "status": "observed",
      "source": "human-playtest",
      "instrument": "moderated task observation v1",
      "unit": "count/session",
      "aggregation": "median",
      "cohort": "new keyboard-and-mouse players",
      "window": "first inventory task",
      "value": 1,
      "sampleSize": 8,
      "evidenceRefs": ["human-sessions"]
    },
    {
      "metricId": "task-completion-rate",
      "scenarioId": "current",
      "status": "observed",
      "source": "human-playtest",
      "instrument": "moderated task observation v1",
      "unit": "proportion",
      "aggregation": "rate",
      "cohort": "new keyboard-and-mouse players",
      "window": "first inventory task",
      "value": 0.875,
      "sampleSize": 8,
      "evidenceRefs": ["human-sessions"]
    },
    {
      "metricId": "task-completion-rate",
      "scenarioId": "proposal",
      "status": "observed",
      "source": "human-playtest",
      "instrument": "moderated task observation v1",
      "unit": "proportion",
      "aggregation": "rate",
      "cohort": "new keyboard-and-mouse players",
      "window": "first inventory task",
      "value": 0.875,
      "sampleSize": 8,
      "evidenceRefs": ["human-sessions"]
    }
  ],
  "criterionVerdicts": [{"criterionId": "primary-improvement", "verdict": "met"}],
  "guardrailVerdicts": [{"criterionId": "completion-guardrail", "verdict": "met"}],
  "overallVerdict": "success",
  "deviations": [],
  "learnings": [{
    "claim": "誤入力は事前閾値を超えて減少した",
    "basis": "primary-improvement and human-sessions",
    "nextAction": "別input methodで再検証"
  }]
}
```

必須fieldは`schemaVersion`、`artifactType`、`experimentId`、`targetId`、`specRef`、`predictionRunRef`、`measurementEvidence`、`results`、`criterionVerdicts`、`guardrailVerdicts`、`overallVerdict`、`deviations`、`learnings`です。

各resultは`metricId`、`scenarioId`、`status`、`source`、`instrument`、`unit`、`aggregation`、`cohort`、`window`、`sampleSize`、`evidenceRefs`を持ちます。statusは`observed / reported-zero / estimated / missing`です。observed、reported-zero、estimatedは有限なvalueを持ち、missingはvalueを持ちません。期限、build、participant、telemetryの不足で測れなかった場合もOutcomeを作ります。missingは0やfailureへ変換しないで、criterionをunresolved、`overallVerdict=unresolved`とします。

resultは`metricId × scenarioId`ごとに一意にします。`referenceScenarioId`を持つcriterionはcandidateとreference双方の同一metric resultから`candidate value - reference value`を計算し、その差分を登録済みcomparator / valueへ適用します。どちらかがmissing、sample minimum未達、source条件不一致、またはraw measurementで再現できない場合は計算で補完せずunresolvedです。

次runのserver decisionは、success criterionを`met / not-met / unresolved`、guardrailを`met / breached / unresolved`として再計算し、各項目の`issues`に未解決理由を残します。guardrailが1件でもbreachedなら`serverOverallVerdict=stopped`、breachがなく未解決があれば`unresolved`、全successがmetなら`success`、それ以外は`failure`です。`recommendedAction`は順に`stop-and-investigate-guardrail / collect-missing-evidence / consider-adoption-within-tested-scope / do-not-adopt-tested-change`を返します。Outcomeの`criterionVerdicts`、`guardrailVerdicts`、`overallVerdict`はclient申告として保持し、`reportedVerdictsMatch`でserver再計算との完全一致を示します。不一致でもserver結果をclient申告へ合わせません。

失敗した実験も`overallVerdict=failure`として保存し、削除や成功への書換えをしません。clientが複数結果を`mixed`と申告しても、serverはguardrail breachを`stopped`として優先します。停止時点、測定済み範囲、rollback判断をdeviations / learningsへ残します。

## 5. Source and measurement integrity

- spec、measurement、outcomeのsource、instrument、unit、aggregation、cohort、windowが一致しないresultはexploratoryには使えますが、登録済みcriterionとserver verificationはunresolvedです。
- AI playtestのtask成功をhuman completion rateやretentionのobservedとして扱わない。AI操作で直接観測できるのは、そのAI client、build、task、control条件での操作・UI反応・再現可能な摩擦です。
- human-playtestは指定participantとprotocolの範囲だけを表し、市場全体へ外挿しない。
- telemetryはevent definition、build、cohort、window、aggregationをEvidenceへ保存する。
- 異なるsourceを平均して単一scoreにしない。比較は同一source / instrument / unit / cohort / window内で行う。
- multiple scenariosでは同じprotocolを使い、順序、carry-over、learning biasをdeviationsに残す。counterbalanceできなければconfidenceを下げる。

## 6. Calibration

- `not-calibrated`: 対応する過去Outcomeをevidenceとして使っていない。
- `partially-calibrated`: 過去Outcomeはあるがprimaryがestimated / missing、criteriaの一部だけobserved、またはtarget、metric、source、instrument、unit、cohort、protocolの一部が異なる。
- `calibrated`: 同一target、metric、source、instrument、unit、cohort、protocolのprimary predictionとobserved outcomeが対応し、そのOutcomeを現在runのevidenceに含め、限定範囲をconfidence basisへ明記している。

`calibrated`はモデル全般の統計的校正を意味しない。何が一致し、何件のprediction / outcomeを比較したかを明記します。client入力の`calibrationStatus`は引き続き`reportedByClient=true`です。

次run保存時、serverはcurrent specの`parentOutcomeRef`、historical spec SHA-256、verified Prediction Runのartifact / canonical SHA-256、Prediction Run → measurement → Outcome → next specの時刻順、raw measurement SHA-256、primary metricのsource / instrument / unit / aggregation / cohort / window、minimum sample、実測値を照合します。current spec、Outcome、measurementをpersona / domain / critic / synthesisの全phaseで実際に使い、primary predictionのvalueまたはdeltaをraw measurementから再計算できた場合だけ`calibration.serverVerified=true`になります。readbackの`forecastComparisons`はpredicted、observed、signed / absolute errorを、`experimentDecisions`は全criterion、guardrail、server / reported overall verdictを返します。`verified-experiment-decision`は登録済み判定を限定sampleで再計算できたことを示すだけで、因果lift、母集団代表性、モデル全般の校正を証明しません。

## 7. Next experiment and stopping

- learningを採用する場合だけ次のExperimentSpecへ`parentOutcomeRef`を付け、次Prediction Runでparent outcomeをevidenceとして封印する。
- source biasだけが繰り返される、guardrailがbreachする、期限またはmaximum sessionsへ達する場合は停止する。
- failed / unresolved outcomeを無視して同じ仮説を繰り返さない。変更点、新source、追加instrument、停止理由のいずれかを次specへ明示する。
- 多数の並列実験、統計検定、sample-size最適化、telemetry ingestion、server-side orchestrationはPilotの対象外とする。
