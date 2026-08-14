import {z} from "zod";
import {
  matchesExperimentSpec,
  type VerifiedExperimentDecision,
  type VerifiedForecastComparison,
} from "./experiments.js";
import type {ResolvedEvidenceResult} from "./run-evidence.js";
import {
  ResolvedEvidenceSchema,
  RunCoverageSchema,
  SimulationDomainSchema,
  SimulationReadinessSchema,
  type SaveRunInput,
} from "./run-schemas.js";

function ratio(covered: number, total: number): number {
  return total === 0 ? 1 : covered / total;
}

export function buildCoverage(
  input: SaveRunInput,
  evidence: Array<z.infer<typeof ResolvedEvidenceSchema>>,
): z.infer<typeof RunCoverageSchema> {
  const scenarioDomainMissing: Array<{
    scenarioId: string;
    domain: z.infer<typeof SimulationDomainSchema>;
  }> = [];
  for (const scenario of input.scenarios) {
    for (const domain of input.selectedDomains) {
      if (!input.rounds.some((round) =>
        round.phase === "domain"
        && round.scenarioId === scenario.id
        && round.domain === domain)) {
        scenarioDomainMissing.push({scenarioId: scenario.id, domain});
      }
    }
  }

  const personaScenarioMissing: Array<{personaId: string; scenarioId: string}> = [];
  for (const personaId of input.personaIds) {
    for (const scenario of input.scenarios) {
      if (!input.rounds.some((round) =>
        round.phase === "persona"
        && round.personaId === personaId
        && round.scenarioId === scenario.id)) {
        personaScenarioMissing.push({personaId, scenarioId: scenario.id});
      }
    }
  }

  const usedEvidence = new Set(input.rounds.flatMap((round) => round.evidenceRefs));
  const analysisEvidence = evidence.filter((item) => item.ref !== input.finalEvaluationRef);
  const unusedRefs = analysisEvidence
    .filter((item) => !usedEvidence.has(item.ref))
    .map((item) => item.ref);

  const domains = input.selectedDomains.map((domain) => {
    const rounds = input.rounds.filter((round) =>
      round.phase === "domain" && round.domain === domain);
    const roundEvidence = new Set(rounds.flatMap((round) => round.evidenceRefs));
    const selectedEvidence = evidence.filter((item) => roundEvidence.has(item.ref));
    return {
      domain,
      scenarioIds: input.scenarios
        .filter((scenario) => rounds.some((round) => round.scenarioId === scenario.id))
        .map((scenario) => scenario.id),
      roundCount: rounds.length,
      evidenceRefs: selectedEvidence.map((item) => item.ref),
      evidenceKinds: [...new Set(selectedEvidence.map((item) => item.kind))],
      sourceTools: [...new Set(selectedEvidence.flatMap((item) =>
        item.sourceTool ? [item.sourceTool] : []))],
    };
  });

  const scenarioDomainTotal = input.scenarios.length * input.selectedDomains.length;
  const personaScenarioTotal = input.personaIds.length * input.scenarios.length;
  const referencedEvidence = analysisEvidence.length - unusedRefs.length;
  return RunCoverageSchema.parse({
    scenarioDomain: {
      covered: scenarioDomainTotal - scenarioDomainMissing.length,
      total: scenarioDomainTotal,
      ratio: ratio(scenarioDomainTotal - scenarioDomainMissing.length, scenarioDomainTotal),
      missing: scenarioDomainMissing,
    },
    personaScenario: {
      covered: personaScenarioTotal - personaScenarioMissing.length,
      total: personaScenarioTotal,
      ratio: ratio(personaScenarioTotal - personaScenarioMissing.length, personaScenarioTotal),
      missing: personaScenarioMissing,
    },
    analysisEvidence: {
      referenced: referencedEvidence,
      total: analysisEvidence.length,
      ratio: ratio(referencedEvidence, analysisEvidence.length),
      unusedRefs,
    },
    domains,
  });
}

export interface OutcomeChainCheck {
  ref: string;
  status: "verified" | "unresolved" | "invalid";
  issues: string[];
  comparison?: VerifiedForecastComparison;
  decision?: VerifiedExperimentDecision;
}

export async function buildSimulationReadiness(
  input: SaveRunInput,
  targetId: string,
  savedAt: string,
  evidence: ResolvedEvidenceResult[],
  verifyOutcome: (
    outcome: ResolvedEvidenceResult,
    currentSpec: ResolvedEvidenceResult | undefined,
  ) => Promise<OutcomeChainCheck>,
): Promise<z.infer<typeof SimulationReadinessSchema>> {
  const experimentSpecs = evidence.filter(
    ({record}) => record.artifactType === "experiment-spec",
  );
  const requiredSpecPhases = ["persona", "domain", "critic", "synthesis"] as const;
  const matchedExperimentSpecs = experimentSpecs.filter(({payload, record}) =>
    matchesExperimentSpec(payload, {
      targetId,
      mode: input.mode,
      scenarios: input.scenarios,
    })
    && Boolean(record.observedAt && Date.parse(record.observedAt) <= Date.parse(savedAt))
    && Boolean(record.savedAt && Date.parse(record.savedAt) <= Date.parse(savedAt))
    && requiredSpecPhases.every((phase) => input.rounds.some((round) =>
      round.phase === phase && round.evidenceRefs.includes(record.ref))));
  const experimentOutcomes = evidence.filter(
    ({record}) => record.artifactType === "experiment-outcome",
  );
  const currentSpec = matchedExperimentSpecs.length === 1
    ? matchedExperimentSpecs[0]
    : undefined;
  const outcomeChecks: OutcomeChainCheck[] = [];
  for (const outcome of experimentOutcomes) {
    outcomeChecks.push(await verifyOutcome(outcome, currentSpec));
  }
  const verifiedChecks = outcomeChecks.filter(({status}) => status === "verified");
  const serverVerified = verifiedChecks.length > 0;
  const experimentDecisions = outcomeChecks.flatMap(({ref, status: outcomeStatus, decision}) => {
    if (!decision) return [];
    const status = outcomeStatus === "verified"
      && decision.serverOverallVerdict !== "unresolved"
      ? "verified" as const
      : "unresolved" as const;
    return [{outcomeRef: ref, status, ...decision}];
  });
  const hasVerifiedDecision = experimentDecisions.some(({status}) => status === "verified");
  const validationStatus = experimentSpecs.length === 0
    ? "absent" as const
    : matchedExperimentSpecs.length === 0
      ? "invalid-plan" as const
      : matchedExperimentSpecs.length > 1
        ? "ambiguous-plan" as const
        : "planned" as const;
  const status = matchedExperimentSpecs.length === 1
    ? "validation-ready" as const
    : "rehearsal" as const;
  const reasons = [
    experimentSpecs.length === 0
      ? "No ExperimentSpec evidence is linked to this run."
      : matchedExperimentSpecs.length === 0
        ? "No linked ExperimentSpec matches this run's target, mode, scenarios, temporal order, primary prediction contract, and required analysis phases."
        : matchedExperimentSpecs.length > 1
          ? "Multiple matching ExperimentSpecs make the preregistered prediction ambiguous."
          : "One matching ExperimentSpec is linked and used across all required analysis phases.",
    "Population representativeness is not established.",
    serverVerified
      ? `${verifiedChecks.length} ExperimentOutcome forecast comparison(s) passed server-side hash-chain, timing, protocol, sample, and raw-measurement verification.`
      : experimentOutcomes.length > 0
        ? "ExperimentOutcome evidence is linked, but no calibration chain passed server verification."
      : "Held-out outcome calibration is not server-verified.",
  ];
  const allowedClaims = [
    "issue-hypothesis",
    "directional-response-hypothesis",
    "test-priority",
    ...(status === "validation-ready" ? ["preregistered-prediction"] as const : []),
    ...(serverVerified ? ["validated-forecast-error"] as const : []),
    ...(hasVerifiedDecision ? ["verified-experiment-decision"] as const : []),
  ];
  return SimulationReadinessSchema.parse({
    status,
    serverAssessed: true,
    populationRepresentativeness: "not-established",
    scenarioComparison: input.mode === "baseline" ? "single-scenario" : "paired-coverage",
    interventionIsolation: "not-verified",
    heldOutValidation: {
      status: validationStatus,
      experimentSpecRefs: experimentSpecs.map(({record}) => record.ref),
      matchedExperimentSpecRefs: matchedExperimentSpecs.map(({record}) => record.ref),
      experimentOutcomeRefs: experimentOutcomes.map(({record}) => record.ref),
      verifiedExperimentOutcomeRefs: verifiedChecks.map(({ref}) => ref),
    },
    calibration: {
      clientReportedStatus: input.confidence.calibrationStatus,
      serverVerified,
      outcomeChecks: outcomeChecks.map(({ref, status, issues}) => ({ref, status, issues})),
      forecastComparisons: verifiedChecks.flatMap(({ref, comparison}) => comparison
        ? [{outcomeRef: ref, ...comparison}]
        : []),
    },
    experimentDecisions,
    allowedClaims,
    blockedClaims: [
      "population-rate",
      "market-share",
      "causal-lift",
      "retention-impact",
    ],
    reasons,
  });
}
