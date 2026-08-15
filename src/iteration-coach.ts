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
  citedHumanEvidenceHashes: string[];
  humanValidations: Array<{
    question: string;
    humanEvidenceHashes: string[];
  }>;
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

export interface IterationCoachFindingHistoryEntry extends IterationCoachFinding {
  status: "active" | "resolved";
  resolvedByRunId: string | null;
}

export interface IterationCoachAnalysis {
  status: "insufficient-history" | "clear" | "findings";
  activeFindings: IterationCoachFindingHistoryEntry[];
  findingHistory: IterationCoachFindingHistoryEntry[];
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
      novelDirectStimulusCount: number | null;
      novelHumanEvidenceCount: number | null;
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

function normalizeQuestion(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

function validationsByQuestion(
  snapshot: IterationSnapshot,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const validation of snapshot.humanValidations) {
    const question = normalizeQuestion(validation.question);
    if (!question) continue;
    const hashes = result.get(question) ?? new Set<string>();
    validation.humanEvidenceHashes.forEach((hash) => hashes.add(hash));
    result.set(question, hashes);
  }
  return result;
}

function novelValues(current: Iterable<string>, seen: ReadonlySet<string>): string[] {
  return [...new Set(current)].filter((value) => !seen.has(value));
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
      whyItMatters: "The same build was reviewed again without a new build-bound image, playtest, first-contact result, or direct measurement.",
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
    resolvedWhen: "A later verified persona round cites a new first-contact, human-playtest, or human-playtest measurement SHA-256 for the repeated question.",
  };
}

interface IterationDelta {
  runId: string;
  savedAt: string;
  decision: IterationDecision;
  buildChangedFromPrevious: boolean | null;
  novelDirectStimulusCount: number | null;
  novelHumanEvidenceCount: number | null;
}

function evaluateIterationHistory(input: readonly IterationSnapshot[]): {
  analysis: IterationCoachAnalysis;
  deltas: IterationDelta[];
} {
  const iterations = [...input].sort((left, right) =>
    left.savedAt.localeCompare(right.savedAt) || left.runId.localeCompare(right.runId));
  if (iterations.length < 2) {
    return {
      analysis: {
        status: "insufficient-history",
        activeFindings: [],
        findingHistory: [],
        card: {
          highestPriorityFinding: null,
          nextAction: "Use play-build for the next bounded operation; coach_history needs two verified developer-project runs to detect repetition.",
          stopCondition: null,
        },
      },
      deltas: iterations.map((iteration) => ({
        runId: iteration.runId,
        savedAt: iteration.savedAt,
        decision: iteration.decision,
        buildChangedFromPrevious: null,
        novelDirectStimulusCount: null,
        novelHumanEvidenceCount: null,
      })),
    };
  }

  const findingHistory: IterationCoachFindingHistoryEntry[] = [];
  let activeFix: {historyIndex: number; buildKey: string} | undefined;
  let activeReview: {historyIndex: number; buildKey: string} | undefined;
  let activeHuman: {historyIndex: number; unresolvedQuestions: Set<string>} | undefined;
  const seenDirectByBuild = new Map<string, Set<string>>();
  const seenHumanEvidence = new Set<string>();
  const deltas: IterationDelta[] = [];

  function activate(value: IterationCoachFinding): number {
    return findingHistory.push({
      ...value,
      status: "active",
      resolvedByRunId: null,
    }) - 1;
  }

  function resolveFinding(historyIndex: number, runId: string): void {
    const entry = findingHistory[historyIndex]!;
    entry.status = "resolved";
    entry.resolvedByRunId = runId;
  }

  for (let index = 0; index < iterations.length; index += 1) {
    const current = iterations[index]!;
    const previous = iterations[index - 1];
    const seenDirect = seenDirectByBuild.get(current.buildKey) ?? new Set<string>();
    const novelDirectStimuli = novelValues(current.directStimulusHashes, seenDirect);
    const currentValidations = validationsByQuestion(current);
    const previousValidations = previous
      ? validationsByQuestion(previous)
      : new Map<string, Set<string>>();
    const currentHumanEvidence = new Set([
      ...current.citedHumanEvidenceHashes,
      ...[...currentValidations.values()].flatMap((hashes) => [...hashes]),
    ]);
    const novelHumanEvidence = new Set(
      novelValues(currentHumanEvidence, seenHumanEvidence),
    );
    const novelHumanByQuestion = new Map<string, string[]>();
    for (const [question, hashes] of currentValidations) {
      const novel = [...hashes].filter((hash) => novelHumanEvidence.has(hash));
      novelHumanByQuestion.set(question, novel);
    }

    deltas.push({
      runId: current.runId,
      savedAt: current.savedAt,
      decision: current.decision,
      buildChangedFromPrevious: previous
        ? current.buildKey !== previous.buildKey
        : null,
      novelDirectStimulusCount: previous ? novelDirectStimuli.length : null,
      novelHumanEvidenceCount: previous ? novelHumanEvidence.size : null,
    });

    if (previous) {
      const sameBuild = previous.buildKey === current.buildKey;

      if (activeFix && current.buildKey !== activeFix.buildKey) {
        resolveFinding(activeFix.historyIndex, current.runId);
        activeFix = undefined;
      }
      if (
        activeReview
        && (current.buildKey !== activeReview.buildKey || novelDirectStimuli.length > 0)
      ) {
        resolveFinding(activeReview.historyIndex, current.runId);
        activeReview = undefined;
      }
      if (activeHuman) {
        for (const question of activeHuman.unresolvedQuestions) {
          if ((novelHumanByQuestion.get(question)?.length ?? 0) > 0) {
            activeHuman.unresolvedQuestions.delete(question);
          }
        }
        const activeEntry = findingHistory[activeHuman.historyIndex]!;
        activeEntry.facts.unresolvedQuestionCount = activeHuman.unresolvedQuestions.size;
        if (activeHuman.unresolvedQuestions.size === 0) {
          resolveFinding(activeHuman.historyIndex, current.runId);
          activeHuman = undefined;
        }
      }

      if (previous.decision === "fix-now" && sameBuild && !activeFix) {
        activeFix = {
          buildKey: current.buildKey,
          historyIndex: activate(finding("fix-now-without-new-build", previous, current, {
            previousDecision: previous.decision,
            sameBuild,
          })),
        };
      }
      if (sameBuild && novelDirectStimuli.length === 0 && !activeReview) {
        activeReview = {
          buildKey: current.buildKey,
          historyIndex: activate(finding("review-without-new-stimulus", previous, current, {
            sameBuild,
            novelDirectStimulusCount: 0,
          })),
        };
      }

      const stalledQuestions = [...currentValidations.keys()].filter((question) =>
        previousValidations.has(question)
        && (novelHumanByQuestion.get(question)?.length ?? 0) === 0);
      if (stalledQuestions.length > 0) {
        if (!activeHuman) {
          activeHuman = {
            historyIndex: activate(finding("human-handoff-stall", previous, current, {
              repeatedQuestionCount: stalledQuestions.length,
              novelHumanEvidenceCount: 0,
              unresolvedQuestionCount: stalledQuestions.length,
            })),
            unresolvedQuestions: new Set(stalledQuestions),
          };
        } else {
          stalledQuestions.forEach((question) =>
            activeHuman!.unresolvedQuestions.add(question));
          findingHistory[activeHuman.historyIndex]!.facts.unresolvedQuestionCount =
            activeHuman.unresolvedQuestions.size;
        }
      }
    }

    current.directStimulusHashes.forEach((hash) => seenDirect.add(hash));
    seenDirectByBuild.set(current.buildKey, seenDirect);
    currentHumanEvidence.forEach((hash) => seenHumanEvidence.add(hash));
  }

  const activeFindings = findingHistory.filter(({status}) => status === "active").sort(
    (left, right) => FINDING_PRIORITY[left.id] - FINDING_PRIORITY[right.id],
  );
  const highest = activeFindings[0];
  return {
    analysis: {
      status: highest ? "findings" : "clear",
      activeFindings,
      findingHistory,
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
    },
    deltas,
  };
}

export function analyzeIterationHistory(
  input: readonly IterationSnapshot[],
): IterationCoachAnalysis {
  return evaluateIterationHistory(input).analysis;
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

      snapshots.push({
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
      });
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
