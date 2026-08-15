import {
  AuditSnapshotBundleEnvelopeSchema,
} from "./audit-snapshot.js";
import type {ArtifactStore} from "./artifacts.js";
import {ExperimentMeasurementSchema} from "./experiments.js";
import {
  evaluateIterationHistory,
  type IterationCoachAnalysis,
  type IterationDecision,
  type IterationDelta,
  type IterationSnapshot,
} from "./iteration-coach-analysis.js";
import {
  FirstContactTestObjectSchema,
  PlaytestCohortObjectSchema,
  PlaytestSessionObjectSchema,
} from "./playtest-evidence.js";
import {
  RevisionBundleEnvelopeSchema,
} from "./revision-bundle.js";
import type {RunArtifact, RunStore} from "./runs.js";

export interface IterationCoachHistoryInput {
  target: string;
  limit?: number;
}

export interface LatestReviewDecision {
  runId: string;
  verdict: "GO" | "HOLD" | "NO-GO";
  decision: IterationDecision;
  playerProblem: string;
  highestRisk: string;
  nextAction: string;
  successSignal: string;
  sourceEvaluation: {
    ref: string;
    targetId: string;
    id: string;
    sha256: string;
  };
}

export interface IterationCoachHistoryResult {
  data: IterationCoachAnalysis & {
    targetId: string | null;
    inspectedRunCount: number;
    analyzedRunCount: number;
    ignoredNonDeveloperRunCount: number;
    excludedIntegrityRunCount: number;
    excludedUnreadableRunCount: number;
    window: {oldest: string; newest: string} | null;
    latestReviewDecision: LatestReviewDecision | null;
    iterations: IterationDelta[];
    boundaries: string[];
  };
  warnings: string[];
}

interface IterationCoachDependencies {
  runStore: Pick<RunStore, "listRuns" | "readRun">;
  artifactStore: Pick<ArtifactStore, "readIntel" | "readEvaluation">;
}

function payloadData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return "data" in payload ? payload.data : payload;
}

function evidenceClass(payload: unknown): {direct: boolean; human: boolean} {
  const data = payloadData(payload);
  if (FirstContactTestObjectSchema.safeParse(data).success) {
    return {direct: true, human: true};
  }
  const session = PlaytestSessionObjectSchema.safeParse(data);
  if (session.success) {
    return {
      direct: true,
      human: session.data.testerType === "human-participant",
    };
  }
  const cohort = PlaytestCohortObjectSchema.safeParse(data);
  if (cohort.success) {
    return {
      direct: true,
      human: cohort.data.sessions.some(
        ({testerType}) => testerType === "human-participant",
      ),
    };
  }
  const measurement = ExperimentMeasurementSchema.safeParse(data);
  if (measurement.success) {
    return {
      direct: [
        "ai-playtest",
        "human-playtest",
        "telemetry",
        "manual-observation",
      ].includes(measurement.data.source),
      human: measurement.data.source === "human-playtest",
    };
  }
  return {direct: false, human: false};
}

function buildBinding(
  payload: unknown,
  mode: "baseline" | "change",
): {key: string; artifactRefs: ReadonlySet<string>} | undefined {
  if (mode === "change") {
    const bundle = RevisionBundleEnvelopeSchema.safeParse(payload);
    return bundle.success
      ? {
          key: `${bundle.data.data.candidate.gitCommitSha}:${bundle.data.data.candidate.buildId}`,
          artifactRefs: new Set(
            bundle.data.data.candidate.artifacts.map(({evidenceRef}) => evidenceRef),
          ),
        }
      : undefined;
  }
  const bundle = AuditSnapshotBundleEnvelopeSchema.safeParse(payload);
  return bundle.success
    ? {
        key: `${bundle.data.data.gitCommitSha}:${bundle.data.data.buildId}`,
        artifactRefs: new Set(
          bundle.data.data.artifacts.map(({evidenceRef}) => evidenceRef),
        ),
      }
    : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

interface CollectedIterationRun {
  snapshot: IterationSnapshot;
  reviewDecision: LatestReviewDecision;
}

async function collectIterationRun(
  dependencies: IterationCoachDependencies,
  run: RunArtifact,
): Promise<CollectedIterationRun> {
  const bundleRef = run.record.mode === "change"
    ? run.record.revisionBundleRef
    : run.record.auditSnapshotBundleRef;
  const bundleEvidence = run.record.evidence.find(
    ({ref, kind}) => ref === bundleRef && kind === "intel",
  );
  if (!bundleEvidence?.targetId) throw new Error("build bundle evidence is missing");
  const bundleRecord = await dependencies.artifactStore.readIntel(
    bundleEvidence.targetId,
    bundleEvidence.id,
  );
  const binding = buildBinding(bundleRecord.payload, run.record.mode);
  if (!binding) throw new Error("build bundle identity is invalid");

  const evaluationEvidence = run.record.evidence.find(
    ({ref, kind}) => ref === run.record.finalEvaluationRef && kind === "evaluation",
  );
  if (!evaluationEvidence?.targetId) throw new Error("final evaluation is missing");
  const evaluation = await dependencies.artifactStore.readEvaluation(
    evaluationEvidence.targetId,
    evaluationEvidence.id,
  );
  const reviewDecision: LatestReviewDecision = {
    runId: run.record.runId,
    verdict: evaluation.developerSummary.verdict,
    decision: evaluation.developerSummary.decision,
    playerProblem: evaluation.decisionCard.playerProblem,
    highestRisk: evaluation.developerSummary.highestRisk,
    nextAction: evaluation.developerSummary.nextAction,
    successSignal: evaluation.developerSummary.successSignal,
    sourceEvaluation: {
      ref: evaluationEvidence.ref,
      targetId: evaluationEvidence.targetId,
      id: evaluationEvidence.id,
      sha256: evaluationEvidence.sha256,
    },
  };

  const citedRefs = new Set(run.record.rounds.flatMap(({evidenceRefs}) => evidenceRefs));
  const directStimulusHashes: string[] = [];
  const citedHumanEvidenceHashes: string[] = [];
  const evidenceClasses = new Map<string, {
    sha256: string;
    human: boolean;
  }>();
  for (const evidence of run.record.evidence) {
    if (!citedRefs.has(evidence.ref)) continue;
    if (evidence.kind === "capture" || evidence.kind === "ui-reference") {
      if (binding.artifactRefs.has(evidence.ref)) {
        directStimulusHashes.push(evidence.sha256);
      }
      evidenceClasses.set(evidence.ref, {
        sha256: evidence.sha256,
        human: false,
      });
      continue;
    }
    if (evidence.kind !== "intel" || !evidence.targetId) continue;
    const record = await dependencies.artifactStore.readIntel(
      evidence.targetId,
      evidence.id,
    );
    const classification = evidenceClass(record.payload);
    evidenceClasses.set(evidence.ref, {
      sha256: evidence.sha256,
      human: classification.human,
    });
    if (classification.direct) directStimulusHashes.push(evidence.sha256);
    if (classification.human) citedHumanEvidenceHashes.push(evidence.sha256);
  }

  return {
    reviewDecision,
    snapshot: {
      runId: run.record.runId,
      savedAt: run.record.savedAt,
      buildKey: binding.key,
      decision: evaluation.decisionCard.decision,
      directStimulusHashes: unique(directStimulusHashes),
      citedHumanEvidenceHashes: unique(citedHumanEvidenceHashes),
      humanValidations: run.record.rounds.flatMap((round) => {
        if (!round.playerSimulation) return [];
        return [{
          question: round.playerSimulation.reflection.humanValidationQuestion,
          humanEvidenceHashes: unique(
            round.playerSimulation.stimulusEvidenceRefs.flatMap((reference) => {
              const evidence = evidenceClasses.get(reference);
              return evidence?.human ? [evidence.sha256] : [];
            }),
          ),
        }];
      }),
    },
  };
}

export async function buildIterationCoachHistory(
  dependencies: IterationCoachDependencies,
  input: IterationCoachHistoryInput,
): Promise<IterationCoachHistoryResult> {
  const limit = input.limit ?? 10;
  const listed = (await dependencies.runStore.listRuns(input.target)).slice(0, limit);
  const warnings: string[] = [];
  const snapshots: IterationSnapshot[] = [];
  const reviewDecisions = new Map<string, LatestReviewDecision>();
  let ignoredNonDeveloperRunCount = 0;
  let excludedIntegrityRunCount = 0;
  let excludedUnreadableRunCount = 0;
  let targetId: string | null = null;

  for (const metadata of listed) {
    let run: RunArtifact;
    try {
      run = await dependencies.runStore.readRun(input.target, metadata.id);
    } catch {
      excludedUnreadableRunCount += 1;
      warnings.push(`iteration coach could not read run: ${metadata.id}`);
      continue;
    }
    if (run.record.subjectKind !== "developer-project") {
      ignoredNonDeveloperRunCount += 1;
      continue;
    }
    if (run.integrity.status !== "verified") {
      excludedIntegrityRunCount += 1;
      warnings.push(`iteration coach excluded run with failed integrity: ${metadata.id}`);
      continue;
    }
    targetId ??= run.record.targetId ?? null;
    try {
      const collected = await collectIterationRun(dependencies, run);
      snapshots.push(collected.snapshot);
      reviewDecisions.set(run.record.runId, collected.reviewDecision);
    } catch {
      excludedUnreadableRunCount += 1;
      warnings.push(`iteration coach could not read bound evidence for run: ${metadata.id}`);
    }
  }

  const ordered = [...snapshots].sort((left, right) =>
    left.savedAt.localeCompare(right.savedAt) || left.runId.localeCompare(right.runId));
  const evaluated = evaluateIterationHistory(ordered);
  if (ignoredNonDeveloperRunCount > 0) {
    warnings.push(`iteration coach ignored ${ignoredNonDeveloperRunCount} non-developer-project run(s)`);
  }

  return {
    data: {
      targetId,
      inspectedRunCount: listed.length,
      analyzedRunCount: ordered.length,
      ignoredNonDeveloperRunCount,
      excludedIntegrityRunCount,
      excludedUnreadableRunCount,
      window: ordered.length > 0
        ? {oldest: ordered[0]!.savedAt, newest: ordered.at(-1)!.savedAt}
        : null,
      latestReviewDecision: ordered.length > 0
        ? reviewDecisions.get(ordered.at(-1)!.runId) ?? null
        : null,
      iterations: evaluated.deltas,
      ...evaluated.analysis,
      boundaries: [
        "Only verified stored developer-project runs inside the requested window are analyzed.",
        "A direct stimulus is a cited build-bound capture or UI reference, first-contact test, playtest, or direct experiment measurement; competitor images outside the active snapshot do not count and no stimulus proves fun.",
        "Human evidence answers a validation question only when its SHA-256 is new inside the analysis window and the same persona round cites it as stimulus evidence.",
        "Findings describe repeated development behavior, not game quality, player population rates, demand, or retention.",
      ],
    },
    warnings,
  };
}
