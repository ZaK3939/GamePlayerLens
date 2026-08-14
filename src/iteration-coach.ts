import {
  AuditSnapshotBundleEnvelopeSchema,
} from "./audit-snapshot.js";
import type {ArtifactStore} from "./artifacts.js";
import {ExperimentMeasurementSchema} from "./experiments.js";
import {
  FirstContactTestObjectSchema,
  PlaytestCohortObjectSchema,
  PlaytestSessionObjectSchema,
} from "./playtest-evidence.js";
import {
  RevisionBundleEnvelopeSchema,
} from "./revision-bundle.js";
import type {RunArtifact, RunStore} from "./runs.js";

export type IterationDecision = "fix-now" | "test-next-build" | "investigate" | "defer";

export interface IterationSnapshot {
  runId: string;
  savedAt: string;
  buildKey: string;
  decision: IterationDecision;
  directStimulusHashes: string[];
  humanEvidenceHashes: string[];
  humanValidationQuestions: string[];
}

export type IterationFindingId =
  | "fix-now-without-new-build"
  | "review-without-new-stimulus"
  | "human-handoff-stall";

export interface IterationCoachFinding {
  id: IterationFindingId;
  severity: "important" | "watch";
  runIds: [string, string];
  facts: Record<string, string | number | boolean>;
  whyItMatters: string;
  nextAction: string;
  resolvedWhen: string;
}

export interface IterationCoachAnalysis {
  status: "insufficient-history" | "clear" | "findings";
  findings: IterationCoachFinding[];
  card: {
    highestPriorityFinding: IterationFindingId | null;
    nextAction: string;
    stopCondition: string | null;
  };
}

export interface IterationCoachHistoryInput {
  target: string;
  limit?: number;
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
    iterations: Array<{
      runId: string;
      savedAt: string;
      decision: IterationDecision;
      buildChangedFromPrevious: boolean | null;
      newDirectStimulusCount: number | null;
      newHumanEvidenceCount: number | null;
    }>;
    boundaries: string[];
  };
  warnings: string[];
}

interface IterationCoachDependencies {
  runStore: Pick<RunStore, "listRuns" | "readRun">;
  artifactStore: Pick<ArtifactStore, "readIntel" | "readEvaluation">;
}

const FINDING_PRIORITY: Record<IterationFindingId, number> = {
  "fix-now-without-new-build": 0,
  "review-without-new-stimulus": 1,
  "human-handoff-stall": 2,
};

function newCount(current: readonly string[], previous: readonly string[]): number {
  const seen = new Set(previous);
  return new Set(current.filter((value) => !seen.has(value))).size;
}

function normalizedQuestions(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US"))
    .filter(Boolean));
}

function sharedQuestionCount(
  current: readonly string[],
  previous: readonly string[],
): number {
  const earlier = normalizedQuestions(previous);
  return [...normalizedQuestions(current)].filter((value) => earlier.has(value)).length;
}

function finding(
  id: IterationFindingId,
  previous: IterationSnapshot,
  current: IterationSnapshot,
  facts: IterationCoachFinding["facts"],
): IterationCoachFinding {
  if (id === "fix-now-without-new-build") {
    return {
      id,
      severity: "important",
      runIds: [previous.runId, current.runId],
      facts,
      whyItMatters: "A fix-now decision was followed by another review of the same declared Git/build identity.",
      nextAction: "Stop analysis, implement the declared repair, produce a new build identity, and operate the blocked task.",
      resolvedWhen: "A verified run cites a different Git/build identity after the repair is operated.",
    };
  }
  if (id === "review-without-new-stimulus") {
    return {
      id,
      severity: "important",
      runIds: [previous.runId, current.runId],
      facts,
      whyItMatters: "The same build was reviewed again without a new capture, playtest, first-contact result, or direct measurement.",
      nextAction: "Stop review work and generate one new direct stimulus by operating the build or testing it with a person.",
      resolvedWhen: "The next verified run contains a new build identity or a new direct-stimulus SHA-256.",
    };
  }
  return {
    id,
    severity: "watch",
    runIds: [previous.runId, current.runId],
    facts,
    whyItMatters: "The same human validation question crossed two reviews without new human evidence.",
    nextAction: "Ask the repeated question in one bounded human session before another review.",
    resolvedWhen: "A later verified run cites a new first-contact, human-playtest, or human-playtest measurement SHA-256.",
  };
}

export function analyzeIterationHistory(
  input: readonly IterationSnapshot[],
): IterationCoachAnalysis {
  const iterations = [...input].sort((left, right) =>
    left.savedAt.localeCompare(right.savedAt) || left.runId.localeCompare(right.runId));
  if (iterations.length < 2) {
    return {
      status: "insufficient-history",
      findings: [],
      card: {
        highestPriorityFinding: null,
        nextAction: "Use play-build for the next bounded operation; coach_history needs two verified developer-project runs to detect repetition.",
        stopCondition: null,
      },
    };
  }

  const latestById = new Map<IterationFindingId, IterationCoachFinding>();
  for (let index = 1; index < iterations.length; index += 1) {
    const previous = iterations[index - 1]!;
    const current = iterations[index]!;
    const sameBuild = previous.buildKey === current.buildKey;
    const newDirectStimulusCount = newCount(
      current.directStimulusHashes,
      previous.directStimulusHashes,
    );
    if (previous.decision === "fix-now" && sameBuild) {
      latestById.set(
        "fix-now-without-new-build",
        finding("fix-now-without-new-build", previous, current, {
          previousDecision: previous.decision,
          sameBuild,
        }),
      );
    }
    if (sameBuild && newDirectStimulusCount === 0) {
      latestById.set(
        "review-without-new-stimulus",
        finding("review-without-new-stimulus", previous, current, {
          sameBuild,
          newDirectStimulusCount,
        }),
      );
    }
    const repeatedQuestionCount = sharedQuestionCount(
      current.humanValidationQuestions,
      previous.humanValidationQuestions,
    );
    const newHumanEvidenceCount = newCount(
      current.humanEvidenceHashes,
      previous.humanEvidenceHashes,
    );
    if (repeatedQuestionCount > 0 && newHumanEvidenceCount === 0) {
      latestById.set(
        "human-handoff-stall",
        finding("human-handoff-stall", previous, current, {
          repeatedQuestionCount,
          newHumanEvidenceCount,
        }),
      );
    }
  }

  const findings = [...latestById.values()].sort(
    (left, right) => FINDING_PRIORITY[left.id] - FINDING_PRIORITY[right.id],
  );
  const highest = findings[0];
  return {
    status: highest ? "findings" : "clear",
    findings,
    card: highest
      ? {
          highestPriorityFinding: highest.id,
          nextAction: highest.nextAction,
          stopCondition: highest.resolvedWhen,
        }
      : {
          highestPriorityFinding: null,
          nextAction: "Continue with the next declared playable operation and preserve its direct result.",
          stopCondition: null,
        },
  };
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

function buildKey(payload: unknown, mode: "baseline" | "change"): string | undefined {
  if (mode === "change") {
    const bundle = RevisionBundleEnvelopeSchema.safeParse(payload);
    return bundle.success
      ? `${bundle.data.data.candidate.gitCommitSha}:${bundle.data.data.candidate.buildId}`
      : undefined;
  }
  const bundle = AuditSnapshotBundleEnvelopeSchema.safeParse(payload);
  return bundle.success
    ? `${bundle.data.data.gitCommitSha}:${bundle.data.data.buildId}`
    : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export async function buildIterationCoachHistory(
  dependencies: IterationCoachDependencies,
  input: IterationCoachHistoryInput,
): Promise<IterationCoachHistoryResult> {
  const limit = input.limit ?? 10;
  const listed = (await dependencies.runStore.listRuns(input.target)).slice(0, limit);
  const warnings: string[] = [];
  const snapshots: IterationSnapshot[] = [];
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
      const identity = buildKey(bundleRecord.payload, run.record.mode);
      if (!identity) throw new Error("build bundle identity is invalid");

      const evaluationEvidence = run.record.evidence.find(
        ({ref, kind}) => ref === run.record.finalEvaluationRef && kind === "evaluation",
      );
      if (!evaluationEvidence?.targetId) throw new Error("final evaluation is missing");
      const evaluation = await dependencies.artifactStore.readEvaluation(
        evaluationEvidence.targetId,
        evaluationEvidence.id,
      );

      const citedRefs = new Set(run.record.rounds.flatMap(({evidenceRefs}) => evidenceRefs));
      const directStimulusHashes: string[] = [];
      const humanEvidenceHashes: string[] = [];
      for (const evidence of run.record.evidence) {
        if (!citedRefs.has(evidence.ref)) continue;
        if (evidence.kind === "capture" || evidence.kind === "ui-reference") {
          directStimulusHashes.push(evidence.sha256);
          continue;
        }
        if (evidence.kind !== "intel" || !evidence.targetId) continue;
        const record = await dependencies.artifactStore.readIntel(
          evidence.targetId,
          evidence.id,
        );
        const classification = evidenceClass(record.payload);
        if (classification.direct) directStimulusHashes.push(evidence.sha256);
        if (classification.human) humanEvidenceHashes.push(evidence.sha256);
      }

      snapshots.push({
        runId: run.record.runId,
        savedAt: run.record.savedAt,
        buildKey: identity,
        decision: evaluation.decisionCard.decision,
        directStimulusHashes: unique(directStimulusHashes),
        humanEvidenceHashes: unique(humanEvidenceHashes),
        humanValidationQuestions: unique(run.record.rounds.flatMap((round) =>
          round.playerSimulation
            ? [round.playerSimulation.reflection.humanValidationQuestion]
            : [])),
      });
    } catch {
      excludedUnreadableRunCount += 1;
      warnings.push(`iteration coach could not read bound evidence for run: ${metadata.id}`);
    }
  }

  const ordered = [...snapshots].sort((left, right) =>
    left.savedAt.localeCompare(right.savedAt) || left.runId.localeCompare(right.runId));
  const analysis = analyzeIterationHistory(ordered);
  const iterations = ordered.map((current, index) => {
    const previous = ordered[index - 1];
    return {
      runId: current.runId,
      savedAt: current.savedAt,
      decision: current.decision,
      buildChangedFromPrevious: previous
        ? current.buildKey !== previous.buildKey
        : null,
      newDirectStimulusCount: previous
        ? newCount(current.directStimulusHashes, previous.directStimulusHashes)
        : null,
      newHumanEvidenceCount: previous
        ? newCount(current.humanEvidenceHashes, previous.humanEvidenceHashes)
        : null,
    };
  });
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
      iterations,
      ...analysis,
      boundaries: [
        "Only verified stored developer-project runs inside the requested window are analyzed.",
        "A direct stimulus is a cited capture, UI reference, first-contact test, playtest, or direct experiment measurement; it does not prove fun.",
        "Findings describe repeated development behavior, not game quality, player population rates, demand, or retention.",
      ],
    },
    warnings,
  };
}
