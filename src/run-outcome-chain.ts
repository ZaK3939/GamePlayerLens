import {
  ExperimentOutcomeSchema,
  ExperimentSpecSchema,
  verifyExperimentOutcome,
} from "./experiments.js";
import type {OutcomeChainCheck} from "./run-analysis.js";
import type {ResolvedEvidenceResult, RunEvidenceResolver} from "./run-evidence.js";
import type {RunIntegrityAuditor} from "./run-integrity.js";
import type {RunArtifactMetadata, RunRecord, SaveRunInput} from "./run-schemas.js";

interface StoredRun {
  metadata: RunArtifactMetadata;
  record: RunRecord;
}

export interface RunOutcomeChainDependencies {
  resolveEvidence: RunEvidenceResolver["resolveEvidence"];
  readStoredRun(target: string, id: string): Promise<StoredRun>;
  auditRun: RunIntegrityAuditor;
}

export type RunOutcomeChainVerifier = (
  outcomeEvidence: ResolvedEvidenceResult,
  currentSpecEvidence: ResolvedEvidenceResult | undefined,
  currentEvidence: ResolvedEvidenceResult[],
  input: SaveRunInput,
  currentSavedAt: string,
) => Promise<OutcomeChainCheck>;

export function createRunOutcomeChainVerifier(
  dependencies: RunOutcomeChainDependencies,
): RunOutcomeChainVerifier {
  const {resolveEvidence, readStoredRun, auditRun} = dependencies;

  async function verifyOutcomeChain(
    outcomeEvidence: ResolvedEvidenceResult,
    currentSpecEvidence: ResolvedEvidenceResult | undefined,
    currentEvidence: ResolvedEvidenceResult[],
    input: SaveRunInput,
    currentSavedAt: string,
  ): Promise<OutcomeChainCheck> {
    const ref = outcomeEvidence.record.ref;
    const outcomeResult = ExperimentOutcomeSchema.safeParse(outcomeEvidence.payload);
    const currentSpecResult = ExperimentSpecSchema.safeParse(currentSpecEvidence?.payload);
    if (!outcomeResult.success) {
      return {ref, status: "invalid", issues: ["ExperimentOutcome schema is invalid."]};
    }
    if (!currentSpecResult.success || !currentSpecEvidence) {
      return {
        ref,
        status: "invalid",
        issues: ["A single matching current ExperimentSpec is required for calibration."],
      };
    }
    const outcome = outcomeResult.data;
    const currentSpec = currentSpecResult.data;
    const chainIssues: string[] = [];
    const requiredPhases = ["persona", "domain", "critic", "synthesis"] as const;
    const usedAcrossRequiredPhases = (evidenceRef: string) => requiredPhases.every(
      (phase) => input.rounds.some((round) =>
        round.phase === phase && round.evidenceRefs.includes(evidenceRef)),
    );

    const parentOutcomeRef = currentSpec.parentOutcomeRef;
    if (
      !parentOutcomeRef
      || parentOutcomeRef.target !== outcomeEvidence.record.targetId
      || parentOutcomeRef.id !== outcomeEvidence.record.id
    ) {
      chainIssues.push("Current ExperimentSpec parentOutcomeRef does not select this Outcome.");
    }
    if (!usedAcrossRequiredPhases(ref)) {
      chainIssues.push("ExperimentOutcome is not used across all required analysis phases.");
    }
    if (
      !outcomeEvidence.record.observedAt
      || !currentSpecEvidence.record.observedAt
      || Date.parse(currentSpecEvidence.record.observedAt) < Date.parse(outcomeEvidence.record.observedAt)
    ) {
      chainIssues.push("Current ExperimentSpec must be observed at or after its parent Outcome.");
    }
    if (
      !outcomeEvidence.record.savedAt
      || !currentSpecEvidence.record.savedAt
      || Date.parse(currentSpecEvidence.record.savedAt) < Date.parse(outcomeEvidence.record.savedAt)
    ) {
      chainIssues.push("Current ExperimentSpec must be saved at or after its parent Outcome.");
    }
    if (
      (outcomeEvidence.record.observedAt
        && Date.parse(outcomeEvidence.record.observedAt) > Date.parse(currentSavedAt))
      || (currentSpecEvidence.record.observedAt
        && Date.parse(currentSpecEvidence.record.observedAt) > Date.parse(currentSavedAt))
    ) {
      chainIssues.push("Current calibration evidence postdates this run.");
    }
    if (
      !outcomeEvidence.record.savedAt
      || !currentSpecEvidence.record.savedAt
      || Date.parse(outcomeEvidence.record.savedAt) > Date.parse(currentSavedAt)
      || Date.parse(currentSpecEvidence.record.savedAt) > Date.parse(currentSavedAt)
    ) {
      chainIssues.push("Current calibration evidence was not saved at or before this run.");
    }

    let historicalSpecEvidence: ResolvedEvidenceResult | undefined;
    try {
      historicalSpecEvidence = await resolveEvidence({
        ref: "historical-spec",
        kind: "intel",
        target: outcome.specRef.target,
        id: outcome.specRef.id,
      });
    } catch {
      chainIssues.push("Referenced historical ExperimentSpec is unavailable.");
    }
    const historicalSpecResult = ExperimentSpecSchema.safeParse(
      historicalSpecEvidence?.payload,
    );
    if (!historicalSpecResult.success || !historicalSpecEvidence) {
      chainIssues.push("Referenced historical ExperimentSpec schema is invalid.");
    } else if (historicalSpecEvidence.record.sha256 !== outcome.specRef.sha256) {
      chainIssues.push("Historical ExperimentSpec SHA-256 does not match Outcome specRef.");
    }

    let predictionRun: {metadata: RunArtifactMetadata; record: RunRecord} | undefined;
    try {
      predictionRun = await readStoredRun(
        outcome.predictionRunRef.target,
        outcome.predictionRunRef.runId,
      );
    } catch {
      chainIssues.push("Referenced Prediction Run is unavailable or invalid.");
    }
    if (predictionRun) {
      if (
        predictionRun.record.targetId !== outcome.targetId
        || predictionRun.metadata.sha256 !== outcome.predictionRunRef.runArtifactSha256
        || predictionRun.record.seal.canonicalSha256
          !== outcome.predictionRunRef.canonicalRecordSha256
      ) {
        chainIssues.push("Prediction Run target or SHA-256 chain does not match Outcome.");
      }
      const historicalSpecRecord = predictionRun.record.evidence.find((item) =>
        item.kind === "intel"
        && item.targetId === outcome.specRef.target
        && item.id === outcome.specRef.id
        && item.sha256 === outcome.specRef.sha256
        && item.artifactType === "experiment-spec");
      if (
        predictionRun.record.simulationReadiness.status !== "validation-ready"
        || !historicalSpecRecord
        || !predictionRun.record.simulationReadiness.heldOutValidation
          .matchedExperimentSpecRefs.includes(historicalSpecRecord.ref)
      ) {
        chainIssues.push("Prediction Run did not seal the referenced ExperimentSpec as its matched plan.");
      }
      try {
        const integrity = await auditRun(predictionRun.record);
        if (integrity.status !== "verified") {
          chainIssues.push("Prediction Run integrity is not verified.");
        }
      } catch {
        chainIssues.push("Prediction Run integrity could not be verified.");
      }
      if (
        !outcomeEvidence.record.observedAt
        || Date.parse(outcomeEvidence.record.observedAt) < Date.parse(predictionRun.record.savedAt)
      ) {
        chainIssues.push("ExperimentOutcome predates its Prediction Run.");
      }
      if (
        !outcomeEvidence.record.savedAt
        || Date.parse(outcomeEvidence.record.savedAt) < Date.parse(predictionRun.record.savedAt)
      ) {
        chainIssues.push("ExperimentOutcome was not saved at or after its Prediction Run.");
      }
      if (
        historicalSpecEvidence?.record.observedAt
        && Date.parse(historicalSpecEvidence.record.observedAt)
          > Date.parse(predictionRun.record.savedAt)
      ) {
        chainIssues.push("Historical ExperimentSpec was not observed at or before the Prediction Run.");
      }
      if (
        !historicalSpecEvidence?.record.savedAt
        || Date.parse(historicalSpecEvidence.record.savedAt)
          > Date.parse(predictionRun.record.savedAt)
      ) {
        chainIssues.push("Historical ExperimentSpec was not saved at or before the Prediction Run.");
      }
    }

    const measurementInputs: Array<{ref: string; payload: unknown}> = [];
    for (const measurementRef of outcome.measurementEvidence) {
      const resolved = currentEvidence.find(({record}) =>
        record.ref === measurementRef.ref
        && record.kind === "intel"
        && record.targetId === measurementRef.target
        && record.id === measurementRef.id);
      if (
        !resolved
        || resolved.record.artifactType !== "experiment-measurement"
        || resolved.record.sha256 !== measurementRef.sha256
      ) {
        chainIssues.push(`Measurement evidence ${measurementRef.ref} is not hash-linked in the current run.`);
        continue;
      }
      if (!usedAcrossRequiredPhases(measurementRef.ref)) {
        chainIssues.push(`Measurement evidence ${measurementRef.ref} is not used across all required analysis phases.`);
      }
      if (
        !resolved.record.observedAt
        || !outcomeEvidence.record.observedAt
        || (predictionRun
          && Date.parse(resolved.record.observedAt) < Date.parse(predictionRun.record.savedAt))
        || Date.parse(resolved.record.observedAt) > Date.parse(outcomeEvidence.record.observedAt)
        || !resolved.record.savedAt
        || !outcomeEvidence.record.savedAt
        || (predictionRun
          && Date.parse(resolved.record.savedAt) < Date.parse(predictionRun.record.savedAt))
        || Date.parse(resolved.record.savedAt) > Date.parse(outcomeEvidence.record.savedAt)
      ) {
        chainIssues.push(`Measurement evidence ${measurementRef.ref} violates Prediction Run → measurement → Outcome ordering.`);
      }
      measurementInputs.push({ref: measurementRef.ref, payload: resolved.payload});
    }

    if (historicalSpecResult.success) {
      const historicalMetric = historicalSpecResult.data.metrics.find(
        ({metricId}) => metricId === historicalSpecResult.data.primaryMetricId,
      );
      const currentMetric = currentSpec.metrics.find(
        ({metricId}) => metricId === currentSpec.primaryMetricId,
      );
      const keys = ["metricId", "source", "instrument", "unit", "aggregation", "cohort", "window"] as const;
      if (!historicalMetric || !currentMetric || keys.some(
        (key) => historicalMetric[key] !== currentMetric[key],
      )) {
        chainIssues.push("Current and historical primary measurement contracts do not match.");
      }
    }

    const forecast = historicalSpecResult.success
      ? verifyExperimentOutcome(
        historicalSpecResult.data,
        outcome,
        measurementInputs,
      )
      : {issues: ["Historical ExperimentSpec is unavailable for forecast comparison."]};
    if (chainIssues.length > 0) {
      return {ref, status: "invalid", issues: [...new Set([...chainIssues, ...forecast.issues])]};
    }
    if (!forecast.comparison) {
      return {
        ref,
        status: "unresolved",
        issues: forecast.issues,
        ...(forecast.decision ? {decision: forecast.decision} : {}),
      };
    }
    return {
      ref,
      status: "verified",
      issues: [],
      comparison: forecast.comparison,
      ...(forecast.decision ? {decision: forecast.decision} : {}),
    };
  }

  return verifyOutcomeChain;
}

