import {
  FrictionSeveritySchema,
  ImmediateRejectSchema,
  InterestSchema,
  PlaytestEventTypeSchema,
  RewardSignalSchema,
  TargetFitSchema,
  ThemeAppealSchema,
  TryIntentSchema,
  UnderstandingSchema,
  VisualQualitySchema,
  type ConceptTest,
  type FirstContactTest,
  type PlaytestCohort,
  type PlaytestSession,
} from "./playtest-evidence.js";

function countValues<T extends string>(values: readonly T[], order: readonly T[]) {
  return Object.fromEntries(order.map((value) => [
    value,
    values.filter((candidate) => candidate === value).length,
  ]));
}

function buildRevisionDesignDiagnostics(
  parentId: string | undefined,
  changedVariables: string[] | undefined,
  invariantsKept: string[] | undefined,
) {
  const multipleChanges = (changedVariables?.length ?? 0) > 1;
  return {
    changedVariables: changedVariables ?? [],
    invariantsDeclaredCount: invariantsKept?.length ?? 0,
    causalAttributionStatus: !parentId
      ? "not-applicable-initial"
      : multipleChanges
        ? "unresolved-multiple-changes"
        : "comparison-candidate-only",
    candidateReviewAreas: multipleChanges ? ["multi-variable-change"] : [],
    interpretationLimit: "Declared variables and invariants support comparison planning only; they do not verify protocol equivalence or prove causality.",
  };
}

export interface ProjectBriefAlignment {
  revisionId?: string;
  oneSentencePromise?: string;
}

export function buildConceptTestDiagnostics(
  conceptTest: ConceptTest,
  projectBrief?: ProjectBriefAlignment,
) {
  const participants = conceptTest.participants;
  const themeUnderstandingCounts = countValues(
    participants.map((participant) => participant.understoodTheme),
    UnderstandingSchema.options,
  );
  const themeSystemFitCounts = countValues(
    participants.map((participant) => participant.themeSystemFit),
    UnderstandingSchema.options,
  );
  const actionUnderstandingCounts = countValues(
    participants.map((participant) => participant.understoodAction),
    UnderstandingSchema.options,
  );
  const rewardUnderstandingCounts = countValues(
    participants.map((participant) => participant.understoodReward),
    UnderstandingSchema.options,
  );
  const interestCounts = countValues(
    participants.map((participant) => participant.interest),
    InterestSchema.options,
  );
  const revisionStatus = !projectBrief
    ? "not-supplied"
    : !projectBrief.revisionId || !conceptTest.projectBriefRevision
      ? "unlinked"
      : projectBrief.revisionId === conceptTest.projectBriefRevision
        ? "matched"
        : "mismatched";
  const promiseStatus = !projectBrief
    ? "not-supplied"
    : !projectBrief.oneSentencePromise
      ? "unlinked"
      : projectBrief.oneSentencePromise === conceptTest.promiseShown
        ? "matched"
        : "mismatched";
  const unaidedSummaryCount = participants.filter(
    (participant) => participant.unaidedSummary !== undefined,
  ).length;
  const understandingMarkedYesWithoutSummaryCount = participants.filter(
    (participant) => participant.unaidedSummary === undefined
      && (
        participant.understoodTheme === "yes"
        || participant.themeSystemFit === "yes"
        || participant.understoodAction === "yes"
        || participant.understoodReward === "yes"
      ),
  ).length;
  const coreDimensionsMarkedYesWithSummaryCount = participants.filter(
    (participant) => participant.unaidedSummary !== undefined
      && participant.understoodTheme === "yes"
      && participant.themeSystemFit === "yes"
      && participant.understoodAction === "yes"
      && participant.understoodReward === "yes",
  ).length;
  const themeSystemFitReasonCount = participants.filter(
    (participant) => participant.themeSystemFitReason !== undefined,
  ).length;
  const confusionNoteCount = participants.reduce(
    (total, participant) => total + participant.confusions.length,
    0,
  );
  const deviationCount = conceptTest.deviations?.length ?? 0;
  const revisionDesign = buildRevisionDesignDiagnostics(
    conceptTest.parentStimulusId,
    conceptTest.changedVariables,
    conceptTest.invariantsKept,
  );
  const candidateReviewAreas = [
    ...([revisionStatus, promiseStatus].some(
      (status) => status === "mismatched" || status === "unlinked",
    ) ? ["stimulus-provenance"] : []),
    ...revisionDesign.candidateReviewAreas,
    ...(deviationCount > 0 ? ["protocol-deviation"] : []),
    ...(themeUnderstandingCounts["not-measured"] > 0
      || themeSystemFitCounts["not-measured"] > 0
      || actionUnderstandingCounts["not-measured"] > 0
      || rewardUnderstandingCounts["not-measured"] > 0
      || interestCounts["not-asked"] > 0
      || unaidedSummaryCount < participants.length
      ? ["measurement-coverage"] : []),
    ...(understandingMarkedYesWithoutSummaryCount > 0
      ? ["teach-back-evidence"] : []),
    ...(themeUnderstandingCounts.no > 0 || themeUnderstandingCounts.unclear > 0
      ? ["theme-legibility"] : []),
    ...(themeSystemFitCounts.no > 0 || themeSystemFitCounts.unclear > 0
      ? ["theme-system-fit"] : []),
    ...(actionUnderstandingCounts.no > 0 || actionUnderstandingCounts.unclear > 0
      ? ["action-legibility"] : []),
    ...(rewardUnderstandingCounts.no > 0 || rewardUnderstandingCounts.unclear > 0
      ? ["reward-legibility"] : []),
    ...(confusionNoteCount > 0 ? ["reported-confusions"] : []),
    ...(interestCounts["would-not-play"] > 0 ? ["interest-follow-up"] : []),
  ];
  return {
    status: "descriptive-only",
    participantCount: participants.length,
    targetFitCounts: countValues(
      participants.map((participant) => participant.targetFit),
      TargetFitSchema.options,
    ),
    themeUnderstandingCounts,
    themeSystemFitCounts,
    themeSystemFitReasonCount,
    actionUnderstandingCounts,
    rewardUnderstandingCounts,
    interestCounts,
    unaidedSummaryCount,
    teachBackAudit: {
      status: unaidedSummaryCount === participants.length
        ? "summary-recorded-for-all"
        : "partial-summary-coverage",
      summaryProvidedCount: unaidedSummaryCount,
      understandingMarkedYesWithoutSummaryCount,
      coreDimensionsMarkedYesWithSummaryCount,
      interpretationLimit: "understoodTheme, themeSystemFit, understoodAction, and understoodReward are coded observations; unaidedSummary is required to audit what the participant could explain in their own words.",
    },
    confusionNoteCount,
    deviationCount,
    briefAlignment: {
      revisionStatus,
      promiseStatus,
      interpretationLimit: "Exact matches establish provenance only; they do not score comprehension, appeal, or brief quality.",
    },
    revisionLoop: {
      status: conceptTest.parentStimulusId ? "linked-revision" : "initial-stimulus",
      ...(conceptTest.parentStimulusId
        ? {parentStimulusId: conceptTest.parentStimulusId}
        : {}),
      changeSummaryDeclared: conceptTest.changeSummary !== undefined,
      changedVariables: revisionDesign.changedVariables,
      invariantsDeclaredCount: revisionDesign.invariantsDeclaredCount,
      causalAttributionStatus: revisionDesign.causalAttributionStatus,
      candidateReviewAreas,
      nextAction: candidateReviewAreas.length > 0
        ? "Treat these as inspection priorities, not causes. If revising, change one core or asset variable, assign a new stimulusId, link parentStimulusId, and retest under a comparable protocol."
        : "No bounded issue signal was recorded; seek gameplay and first-contact asset evidence before making a broader claim.",
      interpretationLimit: "Signals prioritize inspection only; they neither require a revision nor establish which change caused a later result.",
      comparisonInterpretationLimit: revisionDesign.interpretationLimit,
    },
    interpretationLimit: "Counts describe this bounded sample only; they are not population rates, purchase forecasts, or fixed pass thresholds.",
  };
}

export function buildFirstContactTestDiagnostics(firstContactTest: FirstContactTest) {
  const participants = firstContactTest.participants;
  const visualQualityCounts = countValues(
    participants.map((participant) => participant.visualQuality),
    VisualQualitySchema.options,
  );
  const themeLegibilityCounts = countValues(
    participants.map((participant) => participant.understoodTheme),
    UnderstandingSchema.options,
  );
  const themeAppealCounts = countValues(
    participants.map((participant) => participant.themeAppeal),
    ThemeAppealSchema.options,
  );
  const actionLegibilityCounts = countValues(
    participants.map((participant) => participant.understoodAction),
    UnderstandingSchema.options,
  );
  const rewardLegibilityCounts = countValues(
    participants.map((participant) => participant.understoodReward),
    UnderstandingSchema.options,
  );
  const tryIntentCounts = countValues(
    participants.map((participant) => participant.tryIntent),
    TryIntentSchema.options,
  );
  const immediateRejectCounts = countValues(
    participants.map((participant) => participant.immediateReject),
    ImmediateRejectSchema.options,
  );
  const unaidedSummaryCount = participants.filter(
    (participant) => participant.unaidedSummary !== undefined,
  ).length;
  const rejectionReasonCount = participants.filter(
    (participant) => participant.rejectionReason !== undefined,
  ).length;
  const unexplainedImmediateRejectCount = participants.filter(
    (participant) => participant.immediateReject === "yes"
      && participant.rejectionReason === undefined,
  ).length;
  const confusionNoteCount = participants.reduce(
    (total, participant) => total + participant.confusions.length,
    0,
  );
  const deviationCount = firstContactTest.deviations?.length ?? 0;
  const revisionDesign = buildRevisionDesignDiagnostics(
    firstContactTest.parentAssetId,
    firstContactTest.changedVariables,
    firstContactTest.invariantsKept,
  );
  const candidateReviewAreas = [
    ...revisionDesign.candidateReviewAreas,
    ...(deviationCount > 0 ? ["protocol-deviation"] : []),
    ...(themeLegibilityCounts["not-measured"] > 0
      || themeAppealCounts["not-assessed"] > 0
      || actionLegibilityCounts["not-measured"] > 0
      || rewardLegibilityCounts["not-measured"] > 0
      || tryIntentCounts["not-asked"] > 0
      || immediateRejectCounts["not-asked"] > 0
      || visualQualityCounts["not-assessed"] > 0
      || unaidedSummaryCount < participants.length
      ? ["measurement-coverage"] : []),
    ...(visualQualityCounts.rough > 0
      || visualQualityCounts["style-mismatch"] > 0
      || visualQualityCounts.unclear > 0
      ? ["visual-quality"] : []),
    ...(themeLegibilityCounts.no > 0 || themeLegibilityCounts.unclear > 0
      ? ["theme-legibility"] : []),
    ...(themeAppealCounts.no > 0 || themeAppealCounts.unclear > 0
      ? ["theme-appeal"] : []),
    ...(actionLegibilityCounts.no > 0 || actionLegibilityCounts.unclear > 0
      ? ["action-legibility"] : []),
    ...(rewardLegibilityCounts.no > 0 || rewardLegibilityCounts.unclear > 0
      ? ["reward-legibility"] : []),
    ...(tryIntentCounts.maybe > 0 || tryIntentCounts.no > 0
      ? ["try-intent"] : []),
    ...(immediateRejectCounts.yes > 0 ? ["immediate-reject"] : []),
    ...(unexplainedImmediateRejectCount > 0 ? ["rejection-reason-coverage"] : []),
    ...(confusionNoteCount > 0 ? ["reported-confusions"] : []),
  ];
  return {
    status: "descriptive-only",
    assetType: firstContactTest.assetType,
    participantCount: participants.length,
    targetFitCounts: countValues(
      participants.map((participant) => participant.targetFit),
      TargetFitSchema.options,
    ),
    visualQualityCounts,
    themeLegibilityCounts,
    themeAppealCounts,
    actionLegibilityCounts,
    rewardLegibilityCounts,
    tryIntentCounts,
    immediateRejectCounts,
    unaidedSummaryCount,
    rejectionReasonCount,
    unexplainedImmediateRejectCount,
    confusionNoteCount,
    deviationCount,
    revisionLoop: {
      status: firstContactTest.parentAssetId ? "linked-revision" : "initial-asset",
      ...(firstContactTest.parentAssetId
        ? {parentAssetId: firstContactTest.parentAssetId}
        : {}),
      changeSummaryDeclared: firstContactTest.changeSummary !== undefined,
      changedVariables: revisionDesign.changedVariables,
      invariantsDeclaredCount: revisionDesign.invariantsDeclaredCount,
      causalAttributionStatus: revisionDesign.causalAttributionStatus,
      candidateReviewAreas,
      nextAction: candidateReviewAreas.length > 0
        ? "Treat these as inspection priorities, not causes. Revise one asset variable and retest in the same real display context when comparison is needed."
        : "No bounded issue signal was recorded; connect the promise to gameplay evidence before making a broader readiness claim.",
      interpretationLimit: revisionDesign.interpretationLimit,
    },
    rejectionReasonInterpretationLimit: "Missing immediate-reject reasons must not be inferred from other fields or participant responses.",
    visualQualityInterpretationLimit: "Visual-quality labels record participant perception in this exposure context; they are not an objective production-quality grade.",
    themeAppealInterpretationLimit: "Theme appeal records taste in this exposure context and is separate from theme comprehension, production quality, and market demand.",
    tryIntentInterpretationLimit: "Try intent records a bounded self-report after this asset exposure; it is not purchase behavior, demand, conversion, or retained play.",
    interpretationLimit: "Counts describe this bounded sample and exposure context only; they do not establish fun, demand, conversion, or storefront readiness.",
  };
}

export interface PlaytestProtocolAlignment {
  playtestBuild?: string;
  playtestTask?: string;
  playtestControls?: string;
}

function exactAlignment(actual: string, expected: string | undefined) {
  return expected === undefined ? "not-supplied" : actual === expected ? "matched" : "mismatched";
}

export function buildPlaytestSessionDiagnostics(
  session: PlaytestSession,
  protocol: PlaytestProtocolAlignment,
) {
  const durationSeconds = (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1_000;
  const eventCounts = countValues(
    session.observations.map((observation) => observation.eventType),
    PlaytestEventTypeSchema.options,
  );
  const frictionSeverityCounts = countValues(
    session.observations.map((observation) => observation.frictionSeverity),
    FrictionSeveritySchema.options,
  );
  const rewardSignalCounts = countValues(
    session.observations.map((observation) => observation.rewardSignal),
    RewardSignalSchema.options,
  );
  const firstMeaningfulAction = session.observations.find(
    (observation) => observation.meaningfulAction,
  );
  const buildStatus = exactAlignment(session.buildId, protocol.playtestBuild);
  const taskStatus = exactAlignment(session.task, protocol.playtestTask);
  const controlsStatus = exactAlignment(session.controls, protocol.playtestControls);
  const humanConfusionCount = session.humanReport?.confusions.length ?? 0;
  const deviationCount = session.deviations?.length ?? 0;
  const assessedRewardObservationCount = rewardSignalCounts.demonstrated
    + rewardSignalCounts["not-observed"]
    + rewardSignalCounts.unclear;
  const humanReportCoverageMissing = session.testerType === "human-participant"
    && (!session.humanReport
      || session.humanReport.feltReward === "not-asked"
      || session.humanReport.wouldRepeat === "not-asked"
      || !session.humanReport.rewardDescription);
  const revisionDesign = buildRevisionDesignDiagnostics(
    session.parentSessionId,
    session.changedVariables,
    session.invariantsKept,
  );
  const softwareRendered = session.executionEnvironment.graphicsAcceleration === "software";
  const recordedHardware = session.executionEnvironment.graphicsAcceleration === "hardware";
  const candidateReviewAreas = [
    ...([buildStatus, taskStatus, controlsStatus].includes("mismatched")
      ? ["protocol-provenance"] : []),
    ...revisionDesign.candidateReviewAreas,
    ...(deviationCount > 0 ? ["protocol-deviation"] : []),
    ...(session.priorKnowledge === "specification"
      || session.priorKnowledge === "source-code"
      || session.priorKnowledge === "prior-session"
      ? ["prior-knowledge-bias"] : []),
    ...(session.outcome !== "completed" ? ["task-outcome"] : []),
    ...(frictionSeverityCounts.material > 0 || frictionSeverityCounts.blocker > 0
      ? ["material-friction"] : []),
    ...(assessedRewardObservationCount === 0 ? ["reward-evidence-coverage"] : []),
    ...(assessedRewardObservationCount > 0 && (rewardSignalCounts["not-observed"] > 0
      || rewardSignalCounts.unclear > 0
      || rewardSignalCounts.demonstrated === 0)
      ? ["reward-delivery"] : []),
    ...(humanReportCoverageMissing ? ["human-report-coverage"] : []),
    ...(session.humanReport?.feltReward === "no"
      || session.humanReport?.feltReward === "unclear"
      ? ["felt-reward-follow-up"] : []),
    ...(humanConfusionCount > 0 ? ["reported-confusions"] : []),
    ...(session.humanReport?.wouldRepeat === "maybe"
      || session.humanReport?.wouldRepeat === "no"
      ? ["repeat-intent-follow-up"] : []),
    ...(!recordedHardware ? ["execution-environment-generalization"] : []),
  ];
  return {
    status: "descriptive-only",
    sessionId: session.sessionId,
    testerType: session.testerType,
    humanEvidenceStatus: session.testerType === "ai-operated"
      ? "not-applicable-ai-operated"
      : session.humanReport
        ? "human-report-present"
        : "human-report-missing",
    durationSeconds,
    outcome: session.outcome,
    observationCount: session.observations.length,
    firstMeaningfulActionSeconds: firstMeaningfulAction?.elapsedSeconds ?? null,
    eventCounts,
    frictionSeverityCounts,
    rewardSignalCounts,
    humanReport: session.humanReport
      ? {
          feltReward: session.humanReport.feltReward,
          wouldRepeat: session.humanReport.wouldRepeat,
          confusionCount: humanConfusionCount,
        }
      : null,
    protocolAlignment: {
      buildStatus,
      taskStatus,
      controlsStatus,
      interpretationLimit: "Exact matches establish session provenance only; they do not prove equivalent execution or player experience.",
    },
    executionEnvironment: {
      ...session.executionEnvironment,
      generalizationStatus: softwareRendered
        ? "software-renderer-compatibility-path-only"
        : recordedHardware
          ? "recorded-hardware-environment-only"
          : "hardware-generalization-not-established",
      interpretationLimit: softwareRendered
        ? "Software-rendered measurements establish only this recorded compatibility path; they must not be generalized to hardware-rendered player performance."
        : recordedHardware
          ? "Hardware rendering was recorded, but results apply only to this device, runtime, renderer implementation, acceleration mode, and viewport until independently reproduced."
          : "Graphics acceleration was not established, so renderer performance must not be generalized to player hardware.",
    },
    deviationCount,
    revisionLoop: {
      status: session.parentSessionId ? "linked-retest" : "initial-session",
      artifactId: `playtest-session-${session.sessionId}`,
      ...(session.parentSessionId ? {parentSessionId: session.parentSessionId} : {}),
      ...(session.parentSessionId
        ? {parentArtifactId: `playtest-session-${session.parentSessionId}`}
        : {}),
      parentEvidenceStatus: session.parentSessionId
        ? "pending-exact-readback"
        : "not-applicable-initial",
      changeSummaryDeclared: session.changeSummary !== undefined,
      changedVariables: revisionDesign.changedVariables,
      invariantsDeclaredCount: revisionDesign.invariantsDeclaredCount,
      causalAttributionStatus: revisionDesign.causalAttributionStatus,
      comparisonInterpretationLimit: "Declared changes and invariants do not verify that the parent protocol or cohort actually matched; read the exact-saved parent session before interpreting a difference.",
    },
    candidateReviewAreas,
    nextAction: candidateReviewAreas.length > 0
      ? "Treat these as inspection priorities, not causes. Inspect the chronological evidence and retest a bounded change under a comparable protocol."
      : "No bounded issue signal was recorded; add another independent human session before making a broader experience claim.",
    interpretationLimit: "This describes one bounded session only; it is not a fun score, completion rate, retention estimate, or demand forecast.",
  };
}

function countStringGroups(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, sessionCount]) => ({value, sessionCount}));
}

function buildPlaytestCohortEvidenceSummary(sessions: readonly PlaytestSession[]) {
  const observations = sessions.flatMap((session) => session.observations);
  return {
    sessionCount: sessions.length,
    observationCount: observations.length,
    outcomeCounts: countValues(
      sessions.map((session) => session.outcome),
      ["completed", "failed", "blocked", "stopped"],
    ),
    eventCounts: countValues(
      observations.map((observation) => observation.eventType),
      PlaytestEventTypeSchema.options,
    ),
    frictionObservationCounts: countValues(
      observations.map((observation) => observation.frictionSeverity),
      FrictionSeveritySchema.options,
    ),
    frictionAffectedSessionCounts: Object.fromEntries(
      (["minor", "material", "blocker"] as const).map((severity) => [
        severity,
        sessions.filter((session) =>
          session.observations.some(
            (observation) => observation.frictionSeverity === severity,
          )
        ).length,
      ]),
    ),
    rewardObservationCounts: countValues(
      observations.map((observation) => observation.rewardSignal),
      RewardSignalSchema.options,
    ),
    rewardEvidenceSessionCounts: {
      demonstrated: sessions.filter((session) =>
        session.observations.some(
          (observation) => observation.rewardSignal === "demonstrated",
        )
      ).length,
      "not-observed": sessions.filter((session) =>
        session.observations.some(
          (observation) => observation.rewardSignal === "not-observed",
        )
      ).length,
      unclear: sessions.filter((session) =>
        session.observations.some(
          (observation) => observation.rewardSignal === "unclear",
        )
      ).length,
      "unassessed-only": sessions.filter((session) =>
        session.observations.every(
          (observation) => observation.rewardSignal === "not-assessed",
        )
      ).length,
    },
  };
}

const PlaytestProtocolComparisonFields = [
  "task",
  "executionEnvironment",
  "controls",
  "startState",
  "testerType",
  "observationSource",
  "priorKnowledge",
] as const;

function classifyParticipantExposure(
  parent: PlaytestSession,
  current: PlaytestSession,
) {
  if (parent.testerType !== current.testerType) return "mixed-tester-types";
  if (current.testerType === "ai-operated") return "ai-operated-pair";
  return parent.participantId === current.participantId
    ? "repeat-human-participant"
    : "different-human-participants";
}

function presentRewardSignals(session: PlaytestSession) {
  const present = new Set(
    session.observations.map((observation) => observation.rewardSignal),
  );
  return RewardSignalSchema.options.filter((signal) => present.has(signal));
}

function hasMaterialOrBlockerFriction(session: PlaytestSession) {
  return session.observations.some((observation) =>
    observation.frictionSeverity === "material"
      || observation.frictionSeverity === "blocker"
  );
}

function buildInternalRetestComparison(
  parent: PlaytestSession,
  current: PlaytestSession,
) {
  const fields = Object.fromEntries(
    PlaytestProtocolComparisonFields.map((field) => [
      field,
      field === "executionEnvironment"
        ? JSON.stringify(parent[field]) === JSON.stringify(current[field])
          ? "matched"
          : "mismatched"
        : parent[field] === current[field] ? "matched" : "mismatched",
    ]),
  );
  const mismatchedFields = PlaytestProtocolComparisonFields.filter(
    (field) => fields[field] === "mismatched",
  );
  const changedVariables = current.changedVariables ?? [];
  const unresolvedReasons = [
    ...(changedVariables.length > 1 ? ["multiple-changed-variables"] : []),
    ...(mismatchedFields.length > 0 ? ["protocol-mismatch"] : []),
  ];
  const comparisonStatus = changedVariables.length > 1
    ? "unresolved-multiple-changes"
    : mismatchedFields.length > 0
      ? "unresolved-protocol-mismatch"
      : "comparison-candidate-only";

  return {
    sessionId: current.sessionId,
    parentSessionId: parent.sessionId,
    parentArtifactId: `playtest-session-${parent.sessionId}`,
    parentEvidenceStatus: "present-in-cohort",
    comparisonStatus,
    unresolvedReasons,
    changeSummary: current.changeSummary!,
    changedVariables,
    declaredInvariantCount: current.invariantsKept?.length ?? 0,
    declaredInvariants: current.invariantsKept ?? [],
    protocolComparison: {
      mismatchedFields,
      fields,
      interpretationLimit: "Exact field matches verify only the recorded protocol fields; free-text invariants, moderation behavior, and equivalent player experience remain unverified.",
    },
    participantExposure: classifyParticipantExposure(parent, current),
    evidenceTransition: {
      outcome: {parent: parent.outcome, current: current.outcome},
      rewardSignals: {
        parent: presentRewardSignals(parent),
        current: presentRewardSignals(current),
      },
      materialOrBlockerFrictionPresent: {
        parent: hasMaterialOrBlockerFriction(parent),
        current: hasMaterialOrBlockerFriction(current),
      },
      humanReportedFeltReward: {
        parent: parent.humanReport?.feltReward ?? null,
        current: current.humanReport?.feltReward ?? null,
      },
    },
    interpretationLimit: "The before/after values are descriptive evidence from two bounded sessions. They do not establish that the declared change caused the difference.",
  };
}

export function buildPlaytestCohortDiagnostics(cohort: PlaytestCohort) {
  const sessions = cohort.sessions;
  const humanSessions = sessions.filter(
    (session) => session.testerType === "human-participant",
  );
  const aiSessions = sessions.filter(
    (session) => session.testerType === "ai-operated",
  );
  const participantExposureCounts = new Map<string, number>();
  for (const session of humanSessions) {
    const participantId = session.participantId!;
    participantExposureCounts.set(
      participantId,
      (participantExposureCounts.get(participantId) ?? 0) + 1,
    );
  }
  const repeatHumanParticipantCount = [...participantExposureCounts.values()].filter(
    (count) => count > 1,
  ).length;
  const observations = sessions.flatMap((session) => session.observations);
  const sessionIds = new Set(sessions.map((session) => session.sessionId));
  const sessionsById = new Map(sessions.map((session) => [session.sessionId, session]));
  const linkedSessions = sessions.filter((session) => session.parentSessionId !== undefined);
  const internalParentCount = linkedSessions.filter(
    (session) => sessionIds.has(session.parentSessionId!),
  ).length;
  const externalParentCount = linkedSessions.length - internalParentCount;
  const internalComparisons = linkedSessions.flatMap((session) => {
    const parent = sessionsById.get(session.parentSessionId!);
    return parent ? [buildInternalRetestComparison(parent, session)] : [];
  });
  const externalParentReadbacks = linkedSessions.flatMap((session) =>
    sessionIds.has(session.parentSessionId!)
      ? []
      : [{
          sessionId: session.sessionId,
          parentSessionId: session.parentSessionId!,
          parentArtifactId: `playtest-session-${session.parentSessionId!}`,
          status: "pending-exact-readback",
        }]
  );
  const humanReportStatuses = sessions.map((session) =>
    session.testerType === "ai-operated"
      ? "not-applicable-ai-operated"
      : session.humanReport
        ? "human-report-present"
        : "human-report-missing"
  );
  const buildGroups = countStringGroups(sessions.map((session) => session.buildId));
  const taskGroups = countStringGroups(sessions.map((session) => session.task));
  const executionEnvironmentGroups = countStringGroups(
    sessions.map((session) => JSON.stringify(session.executionEnvironment)),
  );
  const controlsGroups = countStringGroups(sessions.map((session) => session.controls));
  const allSessionEvidence = buildPlaytestCohortEvidenceSummary(sessions);
  const humanReportCoverageMissing = humanSessions.some((session) =>
    !session.humanReport
      || session.humanReport.feltReward === "not-asked"
      || session.humanReport.wouldRepeat === "not-asked"
      || !session.humanReport.rewardDescription
  );
  const testerTypeCounts = countValues(
    sessions.map((session) => session.testerType),
    ["human-participant", "ai-operated"],
  );
  const candidateReviewAreas = [
    ...(testerTypeCounts["human-participant"] > 0 && testerTypeCounts["ai-operated"] > 0
      ? ["mixed-tester-types"] : []),
    ...(buildGroups.length > 1 ? ["build-variation"] : []),
    ...(taskGroups.length > 1
      || executionEnvironmentGroups.length > 1
      || controlsGroups.length > 1
      ? ["protocol-variation"] : []),
    ...(internalComparisons.some(
      (comparison) => comparison.protocolComparison.mismatchedFields.length > 0,
    ) ? ["retest-protocol-mismatch"] : []),
    ...(repeatHumanParticipantCount > 0 ? ["repeat-participant-exposure"] : []),
    ...(humanReportCoverageMissing ? ["human-report-coverage"] : []),
    ...(sessions.some((session) => session.outcome !== "completed")
      ? ["incomplete-session-outcome"] : []),
    ...(sessions.some((session) => (session.deviations?.length ?? 0) > 0)
      ? ["protocol-deviation"] : []),
    ...(allSessionEvidence.frictionAffectedSessionCounts.material > 0
      || allSessionEvidence.frictionAffectedSessionCounts.blocker > 0
      ? ["material-friction"] : []),
    ...(allSessionEvidence.rewardEvidenceSessionCounts["unassessed-only"] > 0
      ? ["reward-evidence-coverage"] : []),
    ...(allSessionEvidence.rewardEvidenceSessionCounts["not-observed"] > 0
      || allSessionEvidence.rewardEvidenceSessionCounts.unclear > 0
      ? ["reward-delivery"] : []),
    ...(humanSessions.some((session) =>
      session.humanReport?.feltReward === "no"
        || session.humanReport?.feltReward === "unclear"
    ) ? ["felt-reward-follow-up"] : []),
    ...(linkedSessions.some((session) => (session.changedVariables?.length ?? 0) > 1)
      ? ["multi-variable-change"] : []),
    ...(externalParentCount > 0 ? ["external-parent-readback"] : []),
    ...(sessions.some(
      (session) => session.executionEnvironment.graphicsAcceleration !== "hardware",
    ) ? ["execution-environment-generalization"] : []),
  ];
  const earliestSession = sessions.reduce((earliest, session) =>
    Date.parse(session.startedAt) < Date.parse(earliest.startedAt) ? session : earliest
  );
  const latestSession = sessions.reduce((latest, session) =>
    Date.parse(session.endedAt) > Date.parse(latest.endedAt) ? session : latest
  );

  return {
    status: "descriptive-only",
    cohortId: cohort.cohortId,
    artifactId: `playtest-cohort-${cohort.cohortId}`,
    sessionCount: sessions.length,
    observationWindow: {
      startedAt: earliestSession.startedAt,
      endedAt: latestSession.endedAt,
    },
    observationCount: observations.length,
    testerTypeCounts,
    humanReportStatusCounts: countValues(humanReportStatuses, [
      "human-report-present",
      "human-report-missing",
      "not-applicable-ai-operated",
    ]),
    uniqueHumanParticipantCount: participantExposureCounts.size,
    repeatHumanParticipantCount,
    targetFitCounts: countValues(
      humanSessions.map((session) => session.targetFit!),
      TargetFitSchema.options,
    ),
    evidenceByTesterType: {
      "human-participant": buildPlaytestCohortEvidenceSummary(humanSessions),
      "ai-operated": buildPlaytestCohortEvidenceSummary(aiSessions),
    },
    protocolGroups: {
      builds: buildGroups,
      tasks: taskGroups,
      executionEnvironments: executionEnvironmentGroups,
      controls: controlsGroups,
      observationSourceCounts: countValues(
        sessions.map((session) => session.observationSource),
        ["direct-session", "moderated", "recording-review"],
      ),
    },
    lineage: {
      linkedRetestCount: linkedSessions.length,
      internalParentCount,
      externalParentCount,
      multiVariableRetestCount: linkedSessions.filter(
        (session) => (session.changedVariables?.length ?? 0) > 1,
      ).length,
    },
    retestComparisons: {
      internalComparisons,
      externalParentReadbacks,
      interpretationLimit: "Internal comparisons are descriptive and never prove causality. External parents remain unresolved until their exact-saved session artifact is read and compared.",
    },
    candidateReviewAreas,
    nextAction: candidateReviewAreas.length > 0
      ? "Inspect candidate areas by exact session ID; do not rank causes from counts alone. Retest one bounded change or register an ExperimentSpec for a planned comparison."
      : "No bounded cohort issue signal was recorded; preserve session-level evidence and define the next falsifiable question before expanding scope.",
    interpretationLimit: "Counts describe this bounded cohort and its recorded exposure only; they are not population rates, independent-sample estimates, completion rates, retention estimates, fun scores, or demand forecasts.",
  };
}

