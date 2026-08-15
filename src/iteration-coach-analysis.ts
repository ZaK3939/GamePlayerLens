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

export interface IterationDelta {
  runId: string;
  savedAt: string;
  decision: IterationDecision;
  buildChangedFromPrevious: boolean | null;
  novelDirectStimulusCount: number | null;
  novelHumanEvidenceCount: number | null;
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

export function evaluateIterationHistory(input: readonly IterationSnapshot[]): {
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
